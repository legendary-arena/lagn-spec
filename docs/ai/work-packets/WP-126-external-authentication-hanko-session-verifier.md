# WP-126 — External Authentication Integration (Hanko Session Verifier)

**Status:** Draft (drafted 2026-05-03; lint-gate self-review **PASS** — see §Lint Self-Review at the foot)
**Primary Layer:** Server (`apps/server/src/auth/hanko/**` — module path locked by D-9904)
**Dependencies:** WP-099 §A / §B / §C (Hanko broker selection, `apps/server/src/auth/hanko/` module-path lock, F-1..F-7 Future-Auth Gates); WP-112 (broker-agnostic orchestrator + `SessionVerifier` interface + `findAccountByAuthProviderSub` + closed-union error codes); WP-052 (identity model: `AccountId`, `AuthProvider`, `legendary.players` table)
**Slot promotion:** Promoted from the deferred-placeholder row added at the `SPEC:` drafting commit for WP-112 (2026-05-02). The provisional WP-099 §B name "WP-1XX External Authentication Integration (Hanko)" was locked to WP-126 at that commit per D-11201.

---

## Session Context

WP-099 (executed 2026-04-27, commits anchoring `D-9901..D-9905`) selected
Hanko as Legendary Arena's authentication broker, locked
`apps/server/src/auth/hanko/` as the only directory permitted to import
Hanko-specific code (D-9904), and declared seven Future-Auth Gates
(F-1..F-7) every auth-broker integration WP must satisfy before merging.

WP-112 (executed 2026-05-02, `EC-112:`) shipped the broker-agnostic
orchestrator. Its `SessionVerifier` interface defines a single seam —
`verify(token: string): Promise<Result<VerifiedSessionClaim>>` — that
admits any verifier implementation. It also locked
`VerifiedSessionClaim` to `{ authProvider, authProviderSub, expiresAt }`
and locked the `SessionVerificationErrorCode` closed union
(`'invalid_token' | 'expired_token' | 'unknown_provider' |
'verification_failed'`). Per D-11201, WP-112 deliberately deferred the
Hanko-specific implementation to a sibling WP — *this* WP.

This WP implements `SessionVerifier` against Hanko. It installs the
Hanko SDK, fetches and caches Hanko's JWKS, validates JWT signatures,
extracts OIDC claims, maps Hanko's federated-IdP claim to the existing
`AuthProvider` enum (`'email' | 'google' | 'discord'` per WP-052 +
D-9902; never `'hanko'` per F-1), and exports a
`createHankoSessionVerifier(config)` factory that production wiring (a
future request-handler WP) injects into the WP-112 orchestrator.

WP-126 ships verifier + JWKS cache + tests + env-var declarations only.
It does NOT wire the verifier into any route handler (that is a future
request-handler WP's scope, mirroring the WP-053 / WP-054 `submitCompetitiveScore`
"ships fail-closed unwired" precedent). Until the request-handler WP
lands, `requireAuthenticatedSession` continues to return
`Result.fail({ code: 'session_verifier_not_configured' })` per D-11204
fail-closed posture; WP-126 makes the verifier *available* but does not
*configure* it.

---

## Goal

After this session, `apps/server/src/auth/hanko/` exists and contains a
production-grade Hanko `SessionVerifier` that:

- Exports `createHankoSessionVerifier(config: HankoVerifierConfig): SessionVerifier` from `apps/server/src/auth/hanko/hankoVerifier.logic.ts`. The factory binds the verifier to a Hanko tenant and returns a closure conforming to the WP-112 `SessionVerifier` interface verbatim — same method signature, same `Result<VerifiedSessionClaim>` shape, same closed-union error codes.
- Fetches Hanko's JWKS from `${tenantBaseUrl}/.well-known/jwks.json`, where `tenantBaseUrl` is the **tenant-scoped JWKS origin** (e.g., `https://passkeys.hanko.io/<tenant_id>` for Hanko Cloud — matches Hanko's documented `/{tenant_id}/.well-known/jwks.json` endpoint shape while preserving the suffix-appended-programmatically invariant). Fetches via Node v22 built-in `fetch`, caches the keys in process memory, and refreshes them on a configurable interval (default locked at execution time per D-12603). The cache is per-verifier-instance — no module-level singleton state.
- Verifies JWT signatures per D-12601's locked dependency surface. Recommended default: zero new dependency — RS256 verification using Node v22 built-ins (`node:crypto` / WebCrypto) against the JWKS-published RSA public keys. Optional alternative: a single `@teamhanko/*` package only if explicitly required for verifier functionality and recorded in the WP body. The verifier rejects unsigned tokens, tokens signed with an unknown `kid`, tokens with malformed claims, and expired tokens.
- Extracts the OIDC `sub` claim into `VerifiedSessionClaim.authProviderSub` verbatim (no rewrite, no canonicalization). Extracts the federated-IdP claim and maps it to one of `'email' | 'google' | 'discord'` via a closed-set lookup; an unrecognized federation value returns `Result.fail({ code: 'unknown_provider' })`.
- Translates every Hanko-side failure mode into one of WP-112's `SessionVerificationErrorCode` values (`'invalid_token' | 'expired_token' | 'unknown_provider' | 'verification_failed'`). No new error code is introduced; no Hanko-specific error code leaks past the verifier boundary.
- Carries logic-pure tests using `node:test` against a fake JWKS endpoint plus signed fixture tokens (no live Hanko tenant, no network access during test runs).
- Declares the Hanko tenant URL and API key (if required by the SDK) as environment variables in `render.yaml` and `.env.example`. Real secrets never appear in the repo.
- Adds the `@teamhanko/*` package(s) to `apps/server/package.json` with exact version pins.
- Adds one `Library-only` row in `docs/ai/REFERENCE/api-endpoints.md` for the `createHankoSessionVerifier` factory per the D-11804 catalog-update obligation.

**Invariant:** WP-126 ships the Hanko verifier + cache + env-var
declarations only — no route registration, no orchestrator
modification, no `requireAuthenticatedSession` call site change. All
production wiring (`configureSessionValidation({ verifier, ... })`) is
deferred to a future request-handler WP.

**Non-Goals Reminder.** This WP does NOT wire authenticated routes,
does NOT introduce CSRF / cookie / WebSocket-carrier handling, does
NOT change any guest-accessible endpoint, and does NOT modify any
WP-112 or WP-052 contract file.

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. WP-126
> touches identity, authentication, and the platform's posture toward
> third-party services; a Vision Alignment block is mandatory.

**Vision clauses touched:** §3 (Player Trust & Fairness), §11
(Stateless Client Philosophy), §14 (Explicit Decisions, No Silent
Drift), §15 (Built for Contributors), Non-Goals NG-1, NG-3, NG-6.

**Conflict assertion:** **No conflict: this WP preserves all touched
clauses.**

- **§3 Player Trust & Fairness.** A passkey-first, signature-verified
  session-validation path eliminates the password-storage attack
  surface (D-9901 rationale). The verifier rejects unsigned tokens,
  unknown-`kid` tokens, and malformed claims by construction; misissued
  tokens cannot impersonate an existing `AccountId`. The closed-union
  error mapping makes verification failures auditable from a single
  call site.
- **§11 Stateless Client Philosophy.** The verifier is request-scoped:
  it consumes a token, returns a `Result<VerifiedSessionClaim>`, and
  carries no per-request state beyond the JWKS cache (which is
  signing-key state, not session state). No session table, no
  per-account in-memory cache, no broker-side cookie handling.
- **§14 Explicit Decisions, No Silent Drift.** The architectural choice
  was already locked by D-11201 (sibling WP, not inline). The four
  decisions surfaced here under §Decision Points are explicit; D-12601
  / D-12602 / D-12603 / D-12604 land at execution time per the WP-099
  D-9904 amendment rule.
- **§15 Built for Contributors.** Hanko is open-source and
  self-hostable per D-9901. Replacement-safety per D-9904 is preserved
  by construction — every Hanko symbol is confined to
  `apps/server/src/auth/hanko/`, and the orchestrator (WP-112) imports
  zero Hanko symbol. A future broker swap is a directory replacement,
  not a multi-file edit.

**Non-Goal proximity check:** Confirmed clear.

- **NG-1 (pay-to-win):** Authentication unlocks account-only
  conveniences only (per D-9905). The verifier introduces no gameplay
  gating, no scoring impact, no leaderboard side effect.
- **NG-3 (content withheld):** WP-126 is verifier infrastructure. It
  gates no content, no hero, no scenario, no rule.
- **NG-6 (dark patterns):** No UI surface in WP-126 (no login screens,
  no upsell prompts, no countdown timers). Server-authoritative
  verification only.
- **NG-2, NG-4, NG-5, NG-7:** N/A — WP-126 introduces no randomized
  purchases, energy systems, advertising, or apologetic monetization.

**Determinism preservation:** **N/A.** WP-126 touches no engine,
registry, scoring, replay, RNG, or simulation surface. Authentication
is a server-layer access concern, never an input to deterministic
gameplay state. Replay determinism (Vision §22, §24) is unaffected by
construction.

---

## WP-099 Future-Auth Gate (F-1..F-7) Disposition

> WP-099 §C locked seven Future-Auth Gates that every auth-broker
> integration WP must satisfy before merging. WP-126 is the canonical
> consumer of this gate — it is the first WP to install Hanko-specific
> code and therefore the first to face every gate item under load. Per
> WP-099 §C "Audit discipline", silent omission of a gate item is a
> §17 lint FAIL.

**Applicability declared:** This WP touches WP-099 §B "Hanko Wiring
Module" — the gate runs.

- **F-1 No `'hanko'` enum value.** **PASS by construction.** WP-126
  introduces zero `auth_provider` enum value extensions, zero
  fixtures, zero seeds, and zero string literal `'hanko'` in any
  database row, test fixture, or canonical readonly array. The
  federated-IdP claim mapping converts Hanko's federation indicator
  to one of `'email' | 'google' | 'discord'` (the WP-052 enum
  unchanged) before any value reaches the orchestrator. Verified by
  grep gate at §Verification Steps.
- **F-2 Hanko code is contained.** **PASS by construction (runtime
  code).** All runtime imports of `@teamhanko/*` (if any per D-12601),
  all broker-specific verification logic, and all broker-specific
  types live under `apps/server/src/auth/hanko/`.
  `apps/server/src/identity/`, `apps/server/src/auth/` (root, sibling
  to `hanko/`), `packages/game-engine/`, `packages/registry/`,
  `apps/registry-viewer/`, and `apps/arena-client/` are Hanko-free in
  runtime TS/JS source. Configuration files (`render.yaml`,
  `.env.example`) MAY contain **placeholder** Hanko Cloud URLs strictly
  as env-var examples per D-12602; these are not runtime imports and
  do not violate containment. Verified by grep gate (runtime sources
  only; `*.ts` / `*.mts` / `*.js` / `*.mjs`) at §Verification Steps.
- **F-3 `AccountId` is server-generated.** **PASS by construction.**
  WP-126 never generates an `AccountId`. The verifier returns a
  `VerifiedSessionClaim` carrying `(authProvider, authProviderSub)`;
  the orchestrator's caller-injected `accountResolver` resolves that
  pair to an existing `AccountId` via WP-112's
  `findAccountByAuthProviderSub`. Account *creation* (`createPlayerAccount`
  → `node:crypto.randomUUID()`) remains WP-052's responsibility per
  D-5201 / D-9902.
- **F-4 Guests still play.** **PASS by construction.** WP-126 adds no
  route handler, no middleware, and no orchestrator wiring. Every
  existing guest-accessible route (`/api/leaderboards/*`,
  `/api/players/:handle/profile`, the boardgame.io built-ins)
  continues not to call `requireAuthenticatedSession`. No change to
  the existing guest path is in scope. Verified by the acceptance
  criterion "no existing guest-accessible route is wired through the
  new verifier" at §Acceptance Criteria.
- **F-5 No package-list expansion beyond Hanko.** **PASS by
  construction.** WP-126's only `apps/server/package.json` additions
  are `@teamhanko/*` packages (exact version pins per D-12601). No
  Auth0, Clerk, Passport, bcrypt, argon2, scrypt, or password-hashing
  library is added. No `jsonwebtoken` or `jwks-rsa` is added unless
  the selected `@teamhanko/*` package transitively requires them; if
  that occurs, the executor records the transitive in the WP body and
  the catalog row notes.
- **F-6 Replacement-safety smoke check.** **PASS by construction.**
  Thought experiment: "If we removed Hanko tomorrow, what would
  change?" Answer: deletion of `apps/server/src/auth/hanko/`, removal
  of the `@teamhanko/*` package(s) from `apps/server/package.json`,
  removal of Hanko env vars from `render.yaml` and `.env.example`,
  and removal of one Library-only row from `api-endpoints.md`. No
  WP-112 file changes; no WP-052 file changes; no orchestrator
  modification. The replacement-safety guarantee is structural at the
  WP boundary, not a file-by-file grep.
- **F-7 Vision Alignment.** **PASS.** The §Vision Alignment block
  above cites §3, §11, §14, §15, NG-1, NG-3, NG-6 with a no-conflict
  assertion and an N/A determinism line per WP-099 §C requirement.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

> Per D-11804 (single `SPEC:` commit, 2026-04-30): every WP that adds,
> modifies, removes, or changes the status of an HTTP endpoint OR a
> library function reachable via direct import from
> `apps/server/src/**` MUST update `docs/ai/REFERENCE/api-endpoints.md`
> in the same commit. WP-126 adds a new library function reachable via
> direct import — `createHankoSessionVerifier` — so the catalog update
> obligation fires.

**Trigger surfaces (per §21.1):**
- Adds a new library function reachable via direct import from
  `apps/server/src/**` (the `createHankoSessionVerifier` factory).
  Per the `Library-only` taxonomy in `api-endpoints.md`, the factory
  is cataloged with `Status: Library-only` because WP-126 itself
  registers no HTTP route — production wiring is a future
  request-handler WP's responsibility.
- WP-112's existing `requireAuthenticatedSession` and
  `findAccountByAuthProviderSub` rows remain `Library-only` and
  unchanged. Their status flips to `Wired` only when the future
  request-handler WP registers an authenticated route — not in
  WP-126's scope.

**Required catalog update (per §21.2 and the locked replace-whole-row
merge semantics from D-11804):**

- Add one new `Library-only` row in the `## Library-only — Function
  Reachable Via Direct Import, No HTTP Surface Today` section,
  immediately after the WP-112
  `findAccountByAuthProviderSub` row. The row carries:
  - `Status`: `Library-only` (closed-set value per D-11804).
  - `Method` / `Path`: `(n/a)` / `(n/a — function createHankoSessionVerifier)` matching the WP-112 / WP-101 / WP-103 precedent rows in the same section.
  - `Auth`: `(n/a — caller-injected dependencies)` matching the precedent for caller-injected `DatabaseClient` rows.
  - `Request Schema (file ref)`: factory-config arg (`HankoVerifierConfig`) linked to `[apps/server/src/auth/hanko/hankoVerifier.logic.ts:N]` (line number filled in at execution time).
  - `Response Schema (file ref)`: returns `SessionVerifier` (the WP-112 interface). `verify(token)` returns `Promise<Result<VerifiedSessionClaim>>` per WP-112's shipped contract; the failure-payload `code` field carries a `SessionVerificationErrorCode` value (the orchestrator translates it to `SessionValidationErrorCode` at the single mapping site in `sessionToken.logic.ts:191`, mirroring the `as SessionVerificationErrorCode` cast already shipped there).
  - `Authorizing WP`: `WP-126`.
  - `Notes`: cite WP-099 §B as the policy contract; cite F-1..F-7 disposition (PASS by construction); note that production wiring (`configureSessionValidation({ verifier: createHankoSessionVerifier(config), ... })`) is deferred to a future request-handler WP; note any draft-time `[DECISION REQUIRED]` items locked at execution.

**Replace-whole-row semantics (per D-11804):** this is an insertion of
a new row, not an edit of an existing row; no replace-whole-row
pattern applies. The row is appended to the existing `Library-only`
section, immediately after the WP-112 `findAccountByAuthProviderSub`
row.

**Field-name canonicalization (per §21.2):** every field name in the
new row's request and response schemas (`authProvider`,
`authProviderSub`, `authProviderId`, `expiresAt`) matches
`docs/ai/REFERENCE/00.2-data-requirements.md` exactly. `HankoVerifierConfig`
field names (`tenantBaseUrl`, `expectedAudience`,
`jwksRefreshIntervalMs`, etc.) are internal-config names locked at
execution per D-12602; they are not on-the-wire field names and do
not need 00.2 entries.

---

## Decision Points

> Four decisions are surfaced at draft time. **D-12601** (Hanko SDK
> package selection) is the highest-stakes choice and locks the
> dependency surface. **D-12602** (config shape and env-var names)
> defines the executor-facing configuration contract. **D-12603**
> (JWKS refresh policy) defines the cache-warming behavior. **D-12604**
> (federated-IdP claim mapping shape) locks how Hanko's federation
> indicator maps onto the WP-052 `AuthProvider` enum. The recommended
> default for each is documented; the executor may override with
> rationale at execution time.

### D-12601 — Dependency Surface for Verification [DECISION REQUIRED]

**Question.** Does WP-126 install any `@teamhanko/*` package(s), or
does it implement RS256 verification using Node v22 built-ins only?

**Constraints (locked at draft time):**
- F-5 remains in force: no Auth0, Clerk, Passport, bcrypt / argon2 /
  scrypt, and **no top-level** `jsonwebtoken` / `jose` / `jwks-rsa`.
- ESM-only, Node v22+.
- If any `@teamhanko/*` package is added, pins MUST be exact (no `^`,
  no `~`) and recorded in the WP body per `00.3 §7`. The package(s)
  MUST be confined to `apps/server/package.json` `dependencies` (no
  SDK package in any client-app `dependencies`) and MUST support
  Node v22+ ESM (CommonJS-only Hanko packages are forbidden).
- If a package transitively introduces `jsonwebtoken`, `jose`,
  `jwks-rsa`, or another JWT-handling library, the executor records
  the transitive in the WP body. Direct installation of any of these
  libraries as a top-level `dependencies` entry is forbidden under
  either path.

**Recommended default (grounded + minimal):** **No new dependency.**
- Implement JWT signature verification using Node v22 built-ins
  (`node:crypto` / WebCrypto) against the public RSA keys returned by
  the JWKS endpoint at `${tenantBaseUrl}/.well-known/jwks.json` (per
  D-12602's tenant-scoped-origin definition).
- Rationale: available `@teamhanko/*` SDKs surfaced in public docs
  include a browser-focused SDK (`@teamhanko/hanko-frontend-sdk`)
  and a Passkeys API client (`@teamhanko/passkeys-sdk`), neither of
  which is documented in the sources currently in scope as providing
  server-side JWT signature-verification primitives for Node. RS256
  verification against a public JWK is well-served by Node built-ins
  alone.
- This default preserves F-5 by construction (no new JWT library,
  no transitive surface) and reduces replacement-safety surface area
  (less to remove if Hanko is later swapped per D-9901).

**Optional alternative (executor may choose with rationale):** Install
exactly one `@teamhanko/*` package **only** if it is explicitly
needed for verifier functionality (not for future work that lives
outside WP-126's scope). The executor records why the built-in
crypto approach was rejected, the package name + exact version pin,
and any transitive JWT-handling library that arrives with it.

### D-12602 — Config Shape & Env-Var Names [DECISION REQUIRED]

**Question.** What is the exact shape of `HankoVerifierConfig`, and
which environment variables hydrate it?

**Constraints (locked at draft time):**
- `HankoVerifierConfig` MUST be a plain TypeScript interface in
  `apps/server/src/auth/hanko/hankoVerifier.types.ts`. No class, no
  Zod schema (the verifier consumes already-validated config —
  validation happens at startup, not per-request).
- Required fields MUST include the Hanko tenant base URL and the
  expected JWT `aud` claim value. Optional fields MAY include the
  JWKS refresh interval and a clock-skew tolerance for verifier-side
  expiry checks (orchestrator-side expiry stays inclusive `<= now()`
  per WP-112 lock; any skew tolerance lives at the verifier layer).
- Env-var names MUST follow the WP-099 §B precedent — `HANKO_*`
  prefix, screaming-snake-case (per the `00.6-code-style.md` env
  convention). Example names: `HANKO_TENANT_BASE_URL`,
  `HANKO_EXPECTED_AUDIENCE`, `HANKO_JWKS_REFRESH_INTERVAL_MS`.
- Env-var names MUST be declared in both `render.yaml` (under the
  `apps/server` service) and `.env.example` (with placeholder values
  — never real secrets).
- The factory `createHankoSessionVerifier(config)` MUST accept the
  config object and validate required fields at call time (the
  factory is called once at startup; per-request validation is
  outside scope).

**Recommended default (executor may override):**

```typescript
type JwksFetcher = (url: string) => Promise<Response>;

interface HankoVerifierConfig {
  readonly tenantBaseUrl: string;            // e.g. https://passkeys.hanko.io/<tenant_id>
  readonly expectedAudience: string;         // JWT 'aud' claim
  readonly jwksRefreshIntervalMs?: number;   // default per D-12603 if undefined
  readonly fetcher?: JwksFetcher;            // test-injection seam; defaults to global fetch
}
```

`tenantBaseUrl` is the **tenant-scoped origin** — Hanko Cloud's
documented JWKS endpoint shape is `/{tenant_id}/.well-known/jwks.json`,
so the tenant ID is part of the base URL, not a separate config
field. The verifier appends `/.well-known/jwks.json` programmatically
to whatever base URL the operator configures (Hanko Cloud or
self-hosted).

`fetcher` is an optional caller-injected hook that the factory
forwards verbatim into `createJwksCache`. Production wiring leaves
it `undefined` (the cache uses Node v22's global `fetch`); logic-pure
tests pass a fake `(url) => Promise<Response>` that returns stubbed
JWKS payloads. This mirrors the WP-112 caller-injected provider
pattern (verifier + accountResolver + database), extended to the
broker-side network seam, and obviates global `fetch` stubbing.

`jwksRefreshIntervalMs` is optional. If `undefined` at factory time,
the factory applies the D-12603 default (5 minutes / 300_000 ms);
the substitution happens at exactly one site (the factory body) and
is documented with a `// why:` comment. The cache config seen by
`createJwksCache` always carries a concrete number, never `undefined`.

Env vars (locked at execution): `HANKO_TENANT_BASE_URL`,
`HANKO_EXPECTED_AUDIENCE`, `HANKO_JWKS_REFRESH_INTERVAL_MS` (optional;
absence yields the D-12603 default). API-key-style auth is NOT
required for JWKS retrieval (JWKS is a public endpoint by OIDC
convention). Under D-12601's built-ins-only default, no API key is
needed at all. Under the optional `@teamhanko/*` SDK path, if the
chosen package requires an API key for unrelated read paths the
verifier does not exercise, the env var MAY be declared but the
verifier MUST NOT consume it (out of scope for WP-126).

### D-12603 — JWKS Refresh Policy [DECISION REQUIRED]

**Question.** How does the verifier refresh Hanko's JWKS, and what is
the default refresh interval?

**Constraints (locked at draft time):**
- The JWKS cache MUST be per-verifier-instance. No module-level
  singleton. A second call to `createHankoSessionVerifier(config)`
  produces an independent cache (matters for tests that need to
  inject a fake JWKS endpoint).
- The cache MUST refresh on a fixed interval, not lazily on every
  verification call. Per-call fetches would be a DoS vector and a
  latency hazard.
- The cache starts its interval timer at factory construction and
  stops only on process exit. No per-request lifecycle, no manual
  timer-stop API exposed to callers (production wiring lives for
  the process lifetime; tests use fake timers).
- A signature-verification miss (`kid` not in cache) MUST trigger a
  one-shot refresh-and-retry within the same call, NOT a permanent
  cache-miss failure. This handles Hanko's key rotation gracefully
  without waiting for the next interval tick.
- At most **one** refresh is in flight per cache instance at any
  time; concurrent `getKey` waiters share the same in-flight request
  (single-flight). Test cases verify that N concurrent `getKey` calls
  during a refresh produce exactly one network round-trip.
- Refresh failures MUST NOT crash the verifier. A failed refresh
  preserves the existing cache; the verifier returns `Result.fail({
  code: 'verification_failed' })` only if no cached key matches and
  the one-shot retry also fails.
- The refresh interval MUST be observable in production logs (one
  log line per successful refresh, one per failed refresh).
- `getKey(kid)` MUST NOT return a reference to the cache's internal
  `JsonWebKey` object. Either (a) every cache entry is frozen via
  `Object.freeze` at insertion time, or (b) `getKey` returns a
  defensive shallow copy. Aliasing risk per copilot-check Issue #17
  ("Hidden Mutation via Aliasing"): a verifier that mutated the
  returned key — even accidentally, e.g. by tagging it with metadata —
  would corrupt the cache for future calls. Tests assert non-aliasing
  by mutating the returned key and verifying that a subsequent
  `getKey(kid)` for the same `kid` still returns the original shape.

**Recommended default (executor may override):** Refresh interval
**5 minutes** (300_000 ms). Rationale: industry-standard JWKS cache
TTL; balances key-rotation responsiveness against unnecessary
network traffic. The one-shot refresh-and-retry handles unexpected
rotations between interval ticks. Executor may override per Hanko's
documented rotation cadence at execution time.

### D-12604 — Federated-IdP Claim Mapping Shape [DECISION REQUIRED]

**Question.** What Hanko claim does the verifier read to determine
which `AuthProvider` value to write, and how does the closed-set
mapping work?

**Constraints (locked at draft time):**
- The mapping MUST produce one of `'email' | 'google' | 'discord'`
  (per D-9902 / F-1). Any other value returns `Result.fail({ code:
  'unknown_provider' })`.
- The mapping MUST be a closed-set lookup (object literal or
  `switch` statement) — never a string-prefix check, never a regex.
  Per `00.6-code-style.md` "no dynamic property access for known
  keys" and the WP-052 `AuthProvider` precedent.
- The Hanko claim source MUST be documented at the mapping site with
  a `// why:` comment citing the Hanko OIDC profile section that
  defines the federation claim shape (e.g., `idp` claim, or a custom
  claim Hanko ships).
- The mapping MUST NOT introduce a new canonical field name. Hanko's
  raw claim name is internal to the verifier; only the mapped
  `AuthProvider` value crosses the verifier boundary.

**Recommended default (executor may override):** **No default claim
key is assumed at draft time.** The exact claim Hanko's session JWT
uses to indicate federation/IdP identity is not citable from the
sources currently in scope, and the project's "never guess" rule
forbids hard-coding an unverified claim name in a SPEC.

The executor MUST lock the exact claim key and value set used by
Hanko session JWTs for federation/IdP indication (e.g., `idp`,
`identity_provider`, or another documented or custom claim) in
D-12604 at execution time. The lock MUST include:

1. The exact claim name (string key as Hanko emits it).
2. At least one example value per `AuthProvider` member
   (`'email'`, `'google'`, `'discord'`) observed from a representative
   token captured at execution time (or from documentation cited in
   the D-12604 body).
3. The closed-set `HANKO_IDP_TO_AUTH_PROVIDER` lookup table keys
   updated to match those exact observed values.

The lookup table SHAPE is locked here (closed-set
`Readonly<Record<string, AuthProvider>>` with values constrained to
`'email' | 'google' | 'discord'` per F-1); only the KEYS are deferred
to D-12604 execution-time lock. If the claim is missing or its value
is not in `HANKO_IDP_TO_AUTH_PROVIDER`, the verifier returns
`Result.fail({ code: 'unknown_provider', reason: <full sentence> })`.

Tests remain logic-pure by using fixture tokens that include the
locked claim key/value set; no live Hanko tenant is contacted during
test runs.

---

## Assumes

- WP-099 complete. Specifically:
  - `docs/ai/work-packets/WP-099-auth-provider-selection.md §A "Session Validation Middleware"` exists and locks F-1..F-7.
  - `docs/ai/work-packets/WP-099-auth-provider-selection.md §B "Hanko Wiring Module"` exists and locks `apps/server/src/auth/hanko/` as the Hanko-specific module path.
  - `docs/ai/DECISIONS.md` D-9901..D-9905 exist; `D-9904` names `apps/server/src/auth/hanko/` as the locked module path.
- WP-112 complete. Specifically:
  - `apps/server/src/auth/sessionToken.types.ts` exports `SessionVerifier`, `VerifiedSessionClaim`, `SessionVerificationErrorCode`, `SESSION_VERIFICATION_ERROR_CODES`.
  - `apps/server/src/auth/sessionToken.logic.ts` exports `requireAuthenticatedSession`, `configureSessionValidation`.
  - `apps/server/src/auth/accountLookup.logic.ts` exports `findAccountByAuthProviderSub`.
  - `docs/ai/DECISIONS.md` D-11201..D-11204 exist (D-11201 locks the SIBLING-WP architectural choice; D-11202 / D-11203 / D-11204 lock token-extraction source / lookup-helper signature / unconfigured-default behavior at execution).
- WP-052 complete. Specifically:
  - `apps/server/src/identity/identity.types.ts` exports `AccountId`, `AuthProvider`, `AUTH_PROVIDERS = ['email', 'google', 'discord'] as const`, `Result<T>`, `DatabaseClient`.
  - `legendary.players` table exists with `auth_provider` and `auth_provider_id` columns.
- `apps/server/src/auth/hanko/` directory does NOT yet exist (verified at draft time — created by this WP).
- `apps/server/package.json` does NOT yet contain any `@teamhanko/*` dependency (verified at draft time).
- `render.yaml` and `.env.example` do NOT yet contain any `HANKO_*` environment variable declaration (verified at draft time).
- `docs/ai/REFERENCE/api-endpoints.md` carries the WP-112 `Library-only` rows for `requireAuthenticatedSession` and `findAccountByAuthProviderSub` (added at the WP-112 close-out commit).
- `pnpm -r build` exits 0 on `main` HEAD.
- `pnpm --filter @legendary-arena/server test` exits 0 on `main` HEAD.

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/work-packets/WP-099-auth-provider-selection.md §B "Hanko Wiring Module (Future Implementation WP)"` — the policy contract WP-126 implements. Locks `apps/server/src/auth/hanko/` as the module path; locks the federated-IdP claim mapping rule; locks the env-var convention; locks the no-`'hanko'`-enum invariant.
- `docs/ai/work-packets/WP-099-auth-provider-selection.md §C "Future-Auth Gate (Pre-Merge Checklist)"` — F-1..F-7 are the pre-merge gates this WP must satisfy.
- `docs/ai/DECISIONS.md` D-9901..D-9905 — Hanko governance set; WP-126 cites all five.
- `docs/ai/DECISIONS.md` D-11201 — sibling-WP architectural choice (WP-112 is the orchestrator; WP-126 is the verifier). Status flips to `Resolved` when WP-126 lands per D-11201's body.
- `docs/ai/DECISIONS.md` D-11202 / D-11203 / D-11204 — token extraction / lookup-helper signature / unconfigured-default behavior. WP-126 honors the D-11202 token-source lock by construction (the verifier never reads the request directly; the orchestrator extracts the token and passes it to `verify(token)`).
- `docs/ai/DECISIONS.md` D-11804 — the API catalog-update obligation.
- `docs/ai/work-packets/WP-112-session-token-validation-middleware.md` — the orchestrator and `SessionVerifier` interface. WP-126 imports `SessionVerifier`, `VerifiedSessionClaim`, `SessionVerificationErrorCode`, `Result`, and `AuthProvider` verbatim from WP-112's `sessionToken.types.ts`; never redeclares.
- `apps/server/src/auth/sessionToken.types.ts` — read `SessionVerifier`, `VerifiedSessionClaim`, `SessionVerificationErrorCode` verbatim. WP-126 never extends or modifies this file.
- `apps/server/src/identity/identity.types.ts` — read `AuthProvider`, `AUTH_PROVIDERS` verbatim. The mapping in D-12604 produces a value of this type.
- `docs/ai/REFERENCE/api-endpoints.md` — the catalog WP-126 must update per D-11804. Read the WP-112 `Library-only` rows for the row-format precedent.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — canonical field-name spellings (`authProvider`, `authProviderSub`, `authProviderId`, `expiresAt`).
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6 (`// why:` on non-obvious decisions), Rule 11 (full-sentence error messages), Rule 13 (ESM only), Rule 14 (canonical field names), Rule 15 (try/catch on every async I/O).
- `docs/ai/REFERENCE/02-CODE-CATEGORIES.md §server` — `apps/server/` directory classification. The new `apps/server/src/auth/hanko/` subdirectory inherits the `server` category by precedent (D-5202, D-10201, D-10301, D-11201). Whether to add an explicit D-12605 classification entry per the WP-102 / WP-103 precedent is an executor concern.
- `.claude/rules/server.md` — server is a wiring layer; no game logic; no engine import; no `boardgame.io` import in `auth/hanko/`.
- `.claude/rules/architecture.md "Authority Hierarchy"` — VISION.md (#3) wins over WPs (#6) on conflict.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only (N/A here — no engine touch; constraint preserved for template completeness).
- Never throw inside boardgame.io move functions — return void on invalid input (N/A here — no engine touch).
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3 (N/A here — no engine touch).
- `G` must be JSON-serializable at all times (N/A here — no engine touch).
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, `node:crypto`). `fetch` is global in Node v22+; do not import a `node:fetch` module.
- Test files use `.test.ts` extension — never `.test.mjs`.
- No database or network access inside move functions or pure helpers (N/A here — no engine touch). Network access (JWKS fetch) is permitted in `apps/server/src/auth/hanko/jwksCache.logic.ts` only.
- Full file contents for every new or modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- **All Hanko-specific code lives under `apps/server/src/auth/hanko/`.** Per D-9904. Verified by F-2 grep gate. No exception. If the executor finds a Hanko symbol leaking to `apps/server/src/auth/` root, `apps/server/src/identity/`, or any other directory, **STOP** and refactor before continuing.
- **WP-112 contract files are locked.** `apps/server/src/auth/sessionToken.types.ts`, `apps/server/src/auth/sessionToken.logic.ts`, `apps/server/src/auth/accountLookup.logic.ts` and their test siblings MUST NOT be modified. WP-126 imports `SessionVerifier`, `VerifiedSessionClaim`, `SessionVerificationErrorCode`, `Result`, `AuthProvider` from these files; never redeclares.
- **WP-052 contract files are locked.** `apps/server/src/identity/identity.types.ts`, `apps/server/src/identity/identity.logic.ts`, `data/migrations/004_create_players_table.sql`, `data/migrations/005_create_replay_ownership_table.sql` are untouched. The `auth_provider` enum stays `'email' | 'google' | 'discord'`.
- **No modification to WP-099 governance artifacts.** `docs/ai/work-packets/WP-099-auth-provider-selection.md` is locked. The F-1..F-7 disposition above cites WP-099 §A / §B / §C; it does not extend or amend them.
- **No modification to `.claude/rules/*.md`.** WP-126 introduces no new layer rule, no new architectural constraint, and no new authority.
- **No HTTP route registration.** WP-126 ships the verifier factory as a library function. Wiring `requireAuthenticatedSession({ verifier: createHankoSessionVerifier(config), ... })` into any route handler is a future request-handler WP's scope.
- **No orchestrator modification.** `apps/server/src/auth/sessionToken.logic.ts` `requireAuthenticatedSession` continues to fail closed with `code: 'session_verifier_not_configured'` per D-11204 until production wiring lands. WP-126 makes the verifier *available*, not *configured*.
- **No CSRF / cookie / WebSocket carrier handling.** Token extraction is the orchestrator's concern (per D-11202); the verifier consumes a `string` token and returns a `Result<VerifiedSessionClaim>`.
- **No new top-level JWT library.** Per F-5 + D-12601: any `jsonwebtoken` / `jose` / `jwks-rsa` is a Hanko transitive only, never a direct `dependencies` add.
- **No real secrets in the repo.** `render.yaml` and `.env.example` declare placeholder env-var values. The Hanko tenant base URL declared in `.env.example` MUST use a placeholder pattern matching Hanko Cloud's documented `/{tenant_id}/.well-known/jwks.json` endpoint shape (e.g., `https://passkeys.hanko.io/YOUR_TENANT_ID`) — never a real tenant ID.
- **Result-typed at runtime; verifier never throws.** The `verify()` closure and all per-request paths never throw and always return `Result`. The factory `createHankoSessionVerifier(config)` MAY throw **only** for invalid or missing startup configuration (validated once at construction time per D-12602); same posture for `createJwksCache(config)`. Caller-error at runtime never throws. Per WP-052 D-5201 precedent.
- **`Result<T>` is single-parameter.** The shipped contract at `apps/server/src/identity/identity.types.ts:139` is `type Result<T> = { ok: true; value: T } | { ok: false; reason: string; code: IdentityErrorCode }` — single type parameter, with `IdentityErrorCode` hard-wired on the failure branch. WP-112 already uses this `Result<T>` for the verifier's return shape and emits `code` values outside `IdentityErrorCode` (`'invalid_token'`, `'expired_token'`, `'unknown_provider'`, `'verification_failed'`); the orchestrator translates them at the single `as SessionVerificationErrorCode` cast site at `sessionToken.logic.ts:191–193`. WP-126 conforms verbatim to this pattern: the verifier returns `Promise<Result<VerifiedSessionClaim>>` (single param) and emits `SessionVerificationErrorCode` values via the `code` field. WP-126 MUST NOT introduce a second `Result<T, E>` type; MUST NOT amend `identity.types.ts`; MUST NOT alter the orchestrator's translation site. Widening `Result<T>` to `Result<T, E = IdentityErrorCode>` is a separate WP-052 contract change, out of WP-126 scope.
- **Per-instance state, no module-level singletons.** The JWKS cache lives inside the closure returned by `createHankoSessionVerifier`. Two factory calls produce two independent caches.
- **Logic-pure tests.** All tests use `node:test` + `node:assert`. No live Hanko tenant, no real network. Fake JWKS endpoints and signed fixture tokens injected at construction time. Tests run without `TEST_DATABASE_URL` and without network access.
- **No registry-viewer or arena-client modifications.** WP-126 is server-only.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human before proceeding — never guess or invent field names, type shapes, or file paths.
- If WP-099 §B / §C wording cannot be reconciled with the verifier design, STOP and surface the conflict — never silently paraphrase or "smooth over" a divergence.
- If the executor finds Hanko's actual claim shape diverges from D-12604's recommended-default mapping, lock the actual shape in D-12604's body at execution; do not silently re-key the lookup table.
- If the executor locks D-12601's optional `@teamhanko/*` SDK path and the selected package imposes a constraint not anticipated here (e.g., requires a CommonJS-only dependency, requires a Node version above 22, or pulls a transitive that violates F-5), STOP and surface the conflict; do not silently downgrade Node, do not silently switch module systems, do not silently add a top-level JWT library.

**Locked contract values:**
- **Module path:** `apps/server/src/auth/hanko/` (per D-9904 verbatim). No subdirectories deeper than this top level unless the executor records a rationale at execution time.
- **WP-126 file allowlist (≤9 production / reference files; eight or nine projected depending on D-12601 lock):**
  - `apps/server/src/auth/hanko/hankoVerifier.types.ts` — new
  - `apps/server/src/auth/hanko/hankoVerifier.logic.ts` — new
  - `apps/server/src/auth/hanko/hankoVerifier.logic.test.ts` — new
  - `apps/server/src/auth/hanko/jwksCache.logic.ts` — new
  - `apps/server/src/auth/hanko/jwksCache.logic.test.ts` — new
  - `apps/server/package.json` — **modified or unchanged** (modified iff D-12601 locks the `@teamhanko/*` SDK path; unchanged under the built-ins-only default)
  - `render.yaml` — modified (add `HANKO_*` env-var declarations per D-12602)
  - `.env.example` — modified (add `HANKO_*` placeholders per D-12602)
  - `docs/ai/REFERENCE/api-endpoints.md` — modified (add 1 `Library-only` row per D-11804)
- **Factory function name (verbatim):** `createHankoSessionVerifier`. The `create*` prefix mirrors the WP-052 `createPlayerAccount` precedent. Do not rename to `makeHankoSessionVerifier`, `hankoVerifier`, or `getHankoSessionVerifier`.
- **`HankoVerifierConfig` interface name (verbatim):** `HankoVerifierConfig`. Field shape locked by D-12602.
- **Returned interface (verbatim):** `SessionVerifier` from `../sessionToken.types.js` (re-imported, never redeclared).
- **Federated-IdP mapping output values (verbatim):** `'email' | 'google' | 'discord'` (the WP-052 `AuthProvider` union, unchanged). No `'hanko'` value, no fourth member.
- **JWKS endpoint convention:** `${tenantBaseUrl}/.well-known/jwks.json`, where `tenantBaseUrl` is the **tenant-scoped origin** per Hanko Cloud's documented `/{tenant_id}/.well-known/jwks.json` endpoint shape (e.g., `https://passkeys.hanko.io/<tenant_id>` for Hanko Cloud; whatever the operator configures for self-hosted). The verifier MUST NOT hand-code the JWKS path; the `/.well-known/jwks.json` suffix is appended programmatically.
- **JWKS refresh interval default:** 5 minutes (300_000 ms) per D-12603 recommended default; executor may override at lock time.
- **Catalog rows added:** exactly one `Library-only` row in `docs/ai/REFERENCE/api-endpoints.md` for `createHankoSessionVerifier`. Per D-11804 catalog-update obligation.
- **F-1..F-7 disposition:** all seven gate items addressed in §WP-099 Future-Auth Gate Disposition above. Per WP-099 §C "Audit discipline" and "No silent exceptions".

---

## Scope (In)

### A) `apps/server/src/auth/hanko/hankoVerifier.types.ts` — new

Locked exports:

- `HankoVerifierConfig` interface — config shape per D-12602 (recommended default: `{ tenantBaseUrl: string; expectedAudience: string; jwksRefreshIntervalMs?: number }`).
- `HankoIdpToAuthProviderMap` constant — closed-set lookup mapping Hanko federation claim values to WP-052 `AuthProvider` values per D-12604.
- Re-exports `SessionVerifier`, `VerifiedSessionClaim`, `SessionVerificationErrorCode`, `Result`, `AuthProvider` from `../sessionToken.types.js` for downstream-consumer convenience (per the WP-112 re-export precedent).

### B) `apps/server/src/auth/hanko/hankoVerifier.logic.ts` — new

Locked exports:

- `createHankoSessionVerifier(config: HankoVerifierConfig): SessionVerifier` — the factory. Steps in order: (1) validate `config` (full-sentence error if `tenantBaseUrl` or `expectedAudience` missing/empty); (2) construct a per-instance JWKS cache via the `jwksCache.logic.ts` factory; (3) return a `SessionVerifier` whose `verify(token)` method (a) decodes the JWT header to extract `kid`; (b) fetches the matching key from the cache; (c) verifies the JWT signature via the chosen Hanko SDK (per D-12601); (d) verifies the `aud` claim matches `config.expectedAudience`; (e) verifies the `exp` claim is in the future (verifier-side defense-in-depth; orchestrator-side `expiresAt <= now()` check is the canonical lock per WP-112); (f) extracts the federation indicator and looks up the `AuthProvider` via the D-12604 closed-set map; (g) returns `Result.ok({ authProvider, authProviderSub, expiresAt })` on success, `Result.fail({ code: <SessionVerificationErrorCode>, reason: <full sentence> })` on any failure path.
- Each failure path translates Hanko-side errors into one `SessionVerificationErrorCode` value (per WP-112's lock). The mapping is centralized at exactly one site in this file (the catch / dispatch block in the `verify` closure).

### C) `apps/server/src/auth/hanko/hankoVerifier.logic.test.ts` — new

`node:test` suite, all logic-pure (no live Hanko, no real network). One `describe('createHankoSessionVerifier (WP-126)', ...)` block. Test count target: **12–18 cases** covering:

- Happy path: signed fixture token + matching JWKS key → `Result.ok({ authProvider: 'email', authProviderSub: '<sub>', expiresAt: <iso> })`.
- Each `AuthProvider` mapping (`'email'`, `'google'`, `'discord'`) hits the corresponding D-12604 lookup branch and returns the correct value.
- Federation claim absent → `Result.fail({ code: 'unknown_provider' })`.
- Federation claim value not in the D-12604 lookup → `Result.fail({ code: 'unknown_provider' })`.
- JWT signature invalid → `Result.fail({ code: 'invalid_token' })`.
- JWT `kid` not in JWKS cache and one-shot refresh-and-retry also fails → `Result.fail({ code: 'verification_failed' })`.
- JWT `kid` not in initial cache, one-shot refresh succeeds → `Result.ok(...)` (key rotation path).
- JWT `aud` mismatches `config.expectedAudience` → `Result.fail({ code: 'invalid_token' })`.
- JWT `exp` in the past (verifier-side check) → `Result.fail({ code: 'expired_token' })`.
- Malformed JWT (cannot decode header) → `Result.fail({ code: 'invalid_token' })`.
- `config.tenantBaseUrl` empty/missing at factory time → factory throws (factory-time validation only; runtime never throws).
- Two factory calls produce two independent verifiers with independent JWKS caches (per-instance state lock).

### D) `apps/server/src/auth/hanko/jwksCache.logic.ts` — new

Locked exports:

- `createJwksCache(config: JwksCacheConfig): JwksCache` — the cache factory. `JwksCacheConfig` shape (locked): `{ tenantBaseUrl: string; refreshIntervalMs: number; fetcher?: JwksFetcher }`. Returns a per-instance cache with: (a) `getKey(kid: string): Promise<Result<JsonWebKey>>` — returns the cached key for `kid`, or triggers a one-shot refresh-and-retry on miss; (b) internal `refresh()` method (not exported) that fetches `${tenantBaseUrl}/.well-known/jwks.json`, validates the response shape, and updates the cache atomically.
- `JwksFetcher` type — `(url: string) => Promise<Response>`. Optional config field, intentionally typed to match the global `fetch` signature so production wiring passes `fetch` directly. **Test-injection seam:** logic-pure tests pass a fake fetcher that returns a stubbed `Response` carrying signed-fixture JWKS payloads — no global `fetch` stubbing, no `undici` mocking, no real network. If `config.fetcher` is `undefined`, the cache uses the Node v22 global `fetch` directly. This mirrors WP-112's caller-injected provider pattern (verifier + accountResolver + database), extended to the broker-side network seam.
- `JwksCache` interface — exposes only `getKey`. The interval-tick refresh, the one-shot retry, and the in-flight single-flight deduplication are implementation details.
- Errors use the shipped single-parameter `Result<T>`: `Result.fail({ code: 'cache_miss' | 'refresh_failed', reason: <full sentence> })`. The cache's `code` values (`'cache_miss'`, `'refresh_failed'`) are local to this file; the verifier translates them into `SessionVerificationErrorCode` values at the call site in `hankoVerifier.logic.ts`. The cache MUST NOT emit codes from any other union directly.

### E) `apps/server/src/auth/hanko/jwksCache.logic.test.ts` — new

`node:test` suite, all logic-pure (no real network). Test count target: **6–10 cases** covering:

- Happy path: cache populated; `getKey('kid-1')` returns `Result.ok(key)`.
- Cache miss + successful refresh: `getKey('kid-2')` triggers refresh-and-retry, returns `Result.ok(key)`.
- Cache miss + failed refresh: `getKey('unknown-kid')` returns `Result.fail({ code: 'refresh_failed' })`.
- Refresh failure preserves the existing cache: failed refresh + subsequent `getKey('kid-1')` (which IS in the existing cache) returns `Result.ok(key)`.
- Two cache instances are independent (per-instance state lock).
- `refresh()` is rate-limited to one in-flight request at a time (concurrent `getKey` calls during a refresh deduplicate).
- Aliasing defense: mutating a key returned by `getKey(kid)` does not corrupt the cache; a subsequent `getKey(kid)` for the same `kid` returns the unmodified original shape (per the D-12603 freeze-or-copy lock).

### F) `apps/server/package.json` — modified or unchanged (depends on D-12601 lock)

Under D-12601's recommended default (built-ins-only path), this file
is **unchanged** and is dropped from the staged set (eight files
total instead of nine). Under D-12601's optional alternative
(`@teamhanko/*` package added), the package is installed with an
exact version pin (no `^`, no `~`); the executor justifies the
dependency in the WP body per `00.3 §7`. If a transitive dependency
introduces a JWT library (`jose`, `jsonwebtoken`, `jwks-rsa`), the
executor records it. Direct top-level adds of those libraries remain
forbidden under either path.

### G) `render.yaml` — modified

Add `HANKO_TENANT_BASE_URL` and `HANKO_EXPECTED_AUDIENCE` environment
variables under the `apps/server` service. Optional
`HANKO_JWKS_REFRESH_INTERVAL_MS` declared if D-12603 locks a non-default
value. Real values are set in the Render dashboard, NOT in `render.yaml`.

### H) `.env.example` — modified

Add corresponding `HANKO_*` placeholders. Example (matches Hanko
Cloud's documented `/{tenant_id}/.well-known/jwks.json` endpoint
shape):

```
HANKO_TENANT_BASE_URL=https://passkeys.hanko.io/YOUR_TENANT_ID
HANKO_EXPECTED_AUDIENCE=legendary-arena
HANKO_JWKS_REFRESH_INTERVAL_MS=300000
```

Real secrets MUST NOT appear. The `YOUR_TENANT_ID` placeholder is
replaced in the Render dashboard at deploy time, never in this file.
The executor verifies via `git diff .env.example` that no real tenant
ID landed.

### I) `docs/ai/REFERENCE/api-endpoints.md` — modified

Add one `Library-only` row in the `## Library-only — Function
Reachable Via Direct Import, No HTTP Surface Today` section,
immediately after the WP-112 `findAccountByAuthProviderSub` row. Row
mirrors the WP-112 row format. Field names match
`00.2-data-requirements.md` exactly. `Authorizing WP`: `WP-126`.
`Notes`: cite WP-099 §B and the F-1..F-7 disposition; cite the
factory-call-time validation posture; note "no HTTP surface in
WP-126; future request-handler WP wires `requireAuthenticatedSession({
verifier: createHankoSessionVerifier(config), ... })` into authenticated
route handlers". Per D-11804: insertion-only, no replace-whole-row
pattern applies (no existing row is being modified).

Plus governance close-out in the same commit (per the recent WP-104 /
WP-112 / WP-115 / WP-122 / WP-125 precedent — ledger updates land in
the same commit as the production files):

- `docs/ai/STATUS.md` — `### WP-126 / EC-NNN Executed — External Authentication Integration (Hanko Session Verifier) ({YYYY-MM-DD})` block at top of `## Current State`.
- `docs/ai/DECISIONS.md` — D-12601 / D-12602 / D-12603 / D-12604 (locked at execution from the recommended defaults or executor-chosen alternatives) + optional D-12605 (`apps/server/src/auth/hanko/` directory classification per the D-5202 / D-10201 / D-10301 / D-11201 precedent). D-11201's status flips from `Active` to `Resolved` in the same commit (per its body's "Status flips to `Resolved` once WP-126 lands").
- `docs/ai/work-packets/WORK_INDEX.md` — WP-126 row checked off with date + commit hash.
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-NNN row flipped Draft → Done.

---

## Out of Scope

- **No HTTP route registration.** WP-126 ships the verifier as a library function. Wiring `requireAuthenticatedSession` into a Koa route handler is a future request-handler WP's scope (mirrors the WP-053 `submitCompetitiveScore` "ships fail-closed unwired" precedent and WP-112's deferred-row note).
- **No `apps/server/src/auth/sessionToken.{types,logic}.ts` modification.** WP-112 contract files are locked. WP-126 imports their exports verbatim.
- **No `apps/server/src/identity/` modification.** Per D-9904 / WP-099 §B, `identity/` remains broker-free.
- **No `apps/server/src/server.mjs` modification.** Production wiring (`configureSessionValidation({ verifier, ... })`) is a future request-handler WP's scope.
- **No login UI, no account-creation flow, no `/account` surface.** Future work — likely a paired UI WP.
- **No CSRF middleware, no cookie support, no WebSocket carrier.** Token extraction per D-11202 is the orchestrator's concern; the verifier consumes a `string` token.
- **No rate limiting, no IP-based throttling.** Future hardening WP.
- **No multi-device session management, no session revocation API.** Future hardening WP. Hanko-side revocation (e.g., admin-revoking a token) is observable through the JWKS cache only at the next refresh tick or via the verifier's `'invalid_token'` error code; richer revocation surfaces are out of scope.
- **No `legendary.sessions` table, no session-token storage in PostgreSQL.** WP-126 is stateless on the server side beyond the JWKS cache.
- **No modifications to the boardgame.io built-in routes.** Authentication does not gate match creation, lobby join, or play — those routes remain `guest` per the existing `api-endpoints.md` rows.
- **No modifications to `apps/server/src/profile/`, `apps/server/src/leaderboards/`, or any other existing route module.**
- **No `'hanko'` enum value introduction.** F-1 of WP-099 §C is preserved by construction.
- **No category-wide `auth_provider` enum extension.** Per D-9902, the existing `'email' | 'google' | 'discord'` enum is unchanged.
- **No new top-level JWT library.** Per F-5 + D-12601, JWT-handling libraries arrive only as Hanko transitives.
- **No new canonical wire-level field name.** `HankoVerifierConfig` field names are internal-config only and do not need 00.2 entries.
- **No live Hanko tenant.** Tests use a fake JWKS endpoint and signed fixture tokens. No `TEST_HANKO_*` env var introduced.
- Refactors, cleanups, or "while I'm here" improvements are **out of scope** unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

- `apps/server/src/auth/hanko/hankoVerifier.types.ts` — **new** — `HankoVerifierConfig`, `HankoIdpToAuthProviderMap`, re-exports of WP-112 types.
- `apps/server/src/auth/hanko/hankoVerifier.logic.ts` — **new** — `createHankoSessionVerifier` factory; per-instance verifier closure; centralized error mapping.
- `apps/server/src/auth/hanko/hankoVerifier.logic.test.ts` — **new** — logic-pure `node:test` suite (12–18 cases).
- `apps/server/src/auth/hanko/jwksCache.logic.ts` — **new** — `createJwksCache` factory; `getKey` with one-shot refresh-and-retry.
- `apps/server/src/auth/hanko/jwksCache.logic.test.ts` — **new** — logic-pure `node:test` suite (6–10 cases).
- `apps/server/package.json` — **modified or unchanged** — depends on D-12601 lock (modified iff a `@teamhanko/*` package is added; unchanged under the built-ins-only default — dropped from the staged set in that case).
- `render.yaml` — **modified** — add `HANKO_*` env-var declarations per D-12602.
- `.env.example` — **modified** — add `HANKO_*` placeholders per D-12602.
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — add one `Library-only` row per D-11804.

No other files may be modified.

Plus governance close-out (per the recent WP-104 / WP-112 / WP-115 /
WP-122 / WP-125 precedent — ledger updates land in the same commit as
the production files):

- `docs/ai/STATUS.md` — execution entry at top of `## Current State`.
- `docs/ai/DECISIONS.md` — D-12601 / D-12602 / D-12603 / D-12604 (locked at execution) + optional D-12605 (`apps/server/src/auth/hanko/` directory classification). D-11201 status flipped from `Active` to `Resolved` in the same commit.
- `docs/ai/work-packets/WORK_INDEX.md` WP-126 row checked off with date + commit hash.
- `docs/ai/execution-checklists/EC_INDEX.md` EC-NNN row flipped Draft → Done.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Module Layout
- [ ] `apps/server/src/auth/hanko/` directory exists and contains exactly **five** new TypeScript files: three production `.ts` files (`hankoVerifier.types.ts`, `hankoVerifier.logic.ts`, `jwksCache.logic.ts`) plus two `.test.ts` files (`hankoVerifier.logic.test.ts`, `jwksCache.logic.test.ts`).
- [ ] No file in scope outside `apps/server/src/auth/hanko/` imports `@teamhanko/*` or any Hanko-specific symbol (verified by grep at §Verification Steps — F-2 gate).

### `SessionVerifier` Contract Conformance
- [ ] `createHankoSessionVerifier(config)` returns an object whose `verify(token: string)` method matches the WP-112 `SessionVerifier` interface verbatim — same signature, same `Promise<Result<VerifiedSessionClaim>>` return type.
- [ ] The factory imports `SessionVerifier`, `VerifiedSessionClaim`, `SessionVerificationErrorCode`, `Result`, `AuthProvider` from `../sessionToken.types.js`. None of these is redeclared in `hankoVerifier.types.ts`.
- [ ] The factory's returned `verify` closure never throws. Every failure path returns `Result.fail({ code: <SessionVerificationErrorCode>, reason: <full sentence> })`.

### Federated-IdP Mapping
- [ ] The closed-set lookup in `hankoVerifier.logic.ts` (or `hankoVerifier.types.ts`) maps Hanko federation claim values to one of `'email' | 'google' | 'discord'` only. No `'hanko'`, no `'oidc'`, no fourth value.
- [ ] An unrecognized federation value returns `Result.fail({ code: 'unknown_provider', reason: <full sentence> })`.
- [ ] A missing federation claim returns `Result.fail({ code: 'unknown_provider', reason: <full sentence> })`.

### JWKS Cache Behavior
- [ ] `createJwksCache(config)` returns a per-instance cache. Two factory calls produce independent caches (verified by a test case).
- [ ] `getKey(kid)` triggers a one-shot refresh-and-retry on cache miss before returning `Result.fail({ code: 'refresh_failed' })`.
- [ ] A failed refresh preserves the existing cache (a subsequent `getKey` call for a key still in the cache returns `Result.ok`).
- [ ] Concurrent `getKey` calls during an in-flight refresh deduplicate to a single network request.
- [ ] `getKey(kid)` does not alias the cache's internal `JsonWebKey` — either every cache entry is frozen via `Object.freeze` at insertion time, or `getKey` returns a defensive shallow copy. Verified by a test that mutates a returned key and confirms the next `getKey(kid)` still returns the original shape.
- [ ] `createJwksCache(config)` honors the optional `config.fetcher` injection seam — passing a fake `(url) => Promise<Response>` lets tests run with no real network access; absence of `config.fetcher` falls back to Node v22 global `fetch`. `createHankoSessionVerifier(config)` forwards `config.fetcher` to the inner cache verbatim.

### F-1..F-7 Future-Auth Gate
- [ ] **F-1:** Zero file in scope contains the literal `'hanko'` or `"hanko"` as an `auth_provider` enum value, fixture, seed, or quoted string (verified by grep at §Verification Steps Step 4).
- [ ] **F-2:** All runtime `@teamhanko/*` imports (if any per D-12601), `hanko.io` URL string literals in TS/JS source, and Hanko-specific types live under `apps/server/src/auth/hanko/`. `apps/server/src/auth/` (root, sibling), `apps/server/src/identity/`, `packages/game-engine/`, `packages/registry/`, `apps/registry-viewer/`, `apps/arena-client/` are Hanko-free in runtime sources. Configuration files (`render.yaml`, `.env.example`) MAY contain placeholder Hanko Cloud URLs for env-var declarations; these are not runtime imports and are exempt by design. Verified by grep against TS/JS source only.
- [ ] **F-3:** No call to `node:crypto.randomUUID()` in any WP-126 file. The verifier reads existing IdP claims; it never generates an `AccountId`.
- [ ] **F-4:** No existing guest-accessible route is modified. Verified: `git diff apps/server/src/server.mjs`, `git diff apps/server/src/leaderboards/`, `git diff apps/server/src/profile/`, `git diff apps/server/src/auth/sessionToken.logic.ts`, `git diff apps/server/src/auth/accountLookup.logic.ts` all show no changes.
- [ ] **F-5:** If D-12601 locks the built-ins-only path (recommended default): zero changes to `apps/server/package.json`. If D-12601 locks the optional `@teamhanko/*` SDK path: only `@teamhanko/*` additions appear, with exact version pins. Under either path, no Auth0, Clerk, Passport, bcrypt, argon2, scrypt, or top-level `jsonwebtoken` / `jose` / `jwks-rsa` is present (transitives via a chosen `@teamhanko/*` package are permitted and recorded in the WP body).
- [ ] **F-6:** Replacement-safety thought experiment passes: removing Hanko (deleting `apps/server/src/auth/hanko/`, removing the `@teamhanko/*` deps, removing `HANKO_*` env vars, removing the catalog row) requires zero change to any WP-112, WP-052, or WP-099 file. The orchestrator's `SessionVerifier` interface admits any replacement.
- [ ] **F-7:** WP-126 contains a `## Vision Alignment` block citing §3, §11, §14, §15, NG-1, NG-3, NG-6 with a no-conflict assertion and an N/A determinism line.

### Layer Boundary
- [ ] No `boardgame.io` import in any WP-126 file (verified by grep).
- [ ] No import from `packages/game-engine/`, `packages/registry/`, or `packages/preplan/` in any WP-126 file.
- [ ] No import from `apps/registry-viewer/` or `apps/arena-client/` in any WP-126 file.
- [ ] All WP-126 files live under `apps/server/src/auth/hanko/` exclusively.

### Tests
- [ ] All `hankoVerifier.logic.test.ts` tests pass without a live Hanko tenant and without real network access (logic-pure; fake JWKS endpoint and signed fixture tokens injected at construction).
- [ ] All `jwksCache.logic.test.ts` tests pass without real network access.
- [ ] No `boardgame.io` import in any test file.
- [ ] All test files use `.test.ts` extension.
- [ ] All tests use `node:test` and `node:assert` only.
- [ ] No real Hanko tenant URL appears in any test fixture (fixtures use `https://test.example/` or similar).

### Env Vars & Config
- [ ] `render.yaml` declares `HANKO_TENANT_BASE_URL` and `HANKO_EXPECTED_AUDIENCE` under the `apps/server` service. Real values are NOT in the file (they are set in the Render dashboard).
- [ ] `.env.example` declares the same env vars with placeholder values (e.g., `HANKO_TENANT_BASE_URL=https://passkeys.hanko.io/YOUR_TENANT_ID`, matching Hanko Cloud's `/{tenant_id}/.well-known/jwks.json` endpoint shape). No real tenant ID.
- [ ] If `HANKO_JWKS_REFRESH_INTERVAL_MS` is declared (per D-12603 lock), it appears in both files.

### Scope Enforcement
- [ ] `git diff apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.logic.test.ts apps/server/src/auth/accountLookup.logic.ts apps/server/src/auth/accountLookup.logic.test.ts` returns no changes.
- [ ] `git diff apps/server/src/identity/ data/migrations/004_create_players_table.sql data/migrations/005_create_replay_ownership_table.sql` returns no changes.
- [ ] `git diff docs/ai/work-packets/WP-099-auth-provider-selection.md docs/ai/work-packets/WP-052-player-identity-replay-ownership.md docs/ai/work-packets/WP-112-session-token-validation-middleware.md .claude/` returns no changes.
- [ ] `git diff --name-only` lists eight or nine production / reference files (depending on D-12601 lock — `apps/server/package.json` modified iff a `@teamhanko/*` package is added) plus the four governance ledgers (STATUS / DECISIONS / WORK_INDEX / EC_INDEX). Exactly 12 or 13 files at session close.

### API Catalog (per `00.3 §21` + D-11804)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated in the same commit as the new `apps/server/src/auth/hanko/` files (D-11804 same-commit constraint).
- [ ] One new row added in the `## Library-only` section for `createHankoSessionVerifier`.
- [ ] The new row's `Status` column is exactly `Library-only` (closed-set value per D-11804).
- [ ] The new row's `Auth` column is exactly `(n/a — caller-injected dependencies)`.
- [ ] The new row's `Authorizing WP` column is `WP-126`.
- [ ] Field names in the new row's request and response schemas (`authProvider`, `authProviderSub`, `authProviderId`, `expiresAt`) match `00.2-data-requirements.md` verbatim.

### DECISIONS Anchors
- [ ] D-12601 (Hanko SDK package selection), D-12602 (config shape & env-var names), D-12603 (JWKS refresh policy), D-12604 (federated-IdP claim mapping shape) are written into `docs/ai/DECISIONS.md` with executor's locked choices, rationale, and rejected alternatives. Each entry's status is `Active`.
- [ ] D-11201's status is flipped from `Active` to `Resolved` in `docs/ai/DECISIONS.md` (per its body's "Status flips to `Resolved` once WP-126 lands").
- [ ] (Optional) D-12605 entry recording `apps/server/src/auth/hanko/` server-layer classification, mirroring the D-5202 / D-10201 / D-10301 / D-11201 precedent. May be folded into D-9904's existing scope without a new entry; executor's call.

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 — server tests pass
pnpm --filter @legendary-arena/server test
# Expected: exits 0; new test cases included; engine baseline unchanged

# Step 3 — engine baseline unchanged
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; pass count matches pre-WP-126 baseline

# Step 4 — F-1: no 'hanko' enum literal in any code path
Select-String -Path "apps\server\src\auth","apps\server\src\identity","packages","apps\registry-viewer","apps\arena-client","data" -Pattern "['""]hanko['""]" -Recurse -Include *.ts,*.mts,*.js,*.mjs,*.sql,*.json
# Expected: no matches (the literal string 'hanko' must never appear as an auth_provider value, fixture, seed, or quoted string)

# Step 5 — F-2: Hanko containment (runtime sources only; render.yaml / .env.example exempt by design)
Select-String -Path "apps\server\src\auth\sessionToken.types.ts","apps\server\src\auth\sessionToken.logic.ts","apps\server\src\auth\sessionToken.logic.test.ts","apps\server\src\auth\accountLookup.logic.ts","apps\server\src\auth\accountLookup.logic.test.ts","apps\server\src\identity","packages","apps\registry-viewer","apps\arena-client" -Pattern "@teamhanko|hanko\.io" -Recurse -Include *.ts,*.mts,*.js,*.mjs
# Expected: no matches (every file path above is OUTSIDE apps/server/src/auth/hanko/, so any hit indicates leakage)

# Step 6 — F-3: no AccountId generation in WP-126 files
Select-String -Path "apps\server\src\auth\hanko" -Pattern "randomUUID" -Recurse
# Expected: no matches

# Step 7 — F-4: no guest route is gated by this WP
git diff apps/server/src/server.mjs apps/server/src/leaderboards/ apps/server/src/profile/ apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/accountLookup.logic.ts
# Expected: no output

# Step 8 — F-5: dependency surface matches D-12601 lock
git diff apps/server/package.json
# Expected: zero changes (built-ins-only path per D-12601 default) OR only @teamhanko/* additions (executor's optional SDK path);
# never Auth0 / Clerk / Passport / bcrypt / argon2 / scrypt / top-level jsonwebtoken / jose / jwks-rsa

# Step 9 — no boardgame.io import in any WP-126 file
Select-String -Path "apps\server\src\auth\hanko" -Pattern "from .['""]boardgame\.io" -Recurse
# Expected: no matches

# Step 10 — no engine / registry / preplan import
Select-String -Path "apps\server\src\auth\hanko" -Pattern "@legendary-arena/(game-engine|registry|preplan)" -Recurse
# Expected: no matches

# Step 11 — no orchestrator or accountLookup file modified
git diff apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.logic.test.ts apps/server/src/auth/accountLookup.logic.ts apps/server/src/auth/accountLookup.logic.test.ts
# Expected: no output

# Step 12 — no real secret in .env.example
Select-String -Path ".env.example" -Pattern "HANKO_" 
# Expected: matches showing placeholder values only (e.g., YOUR_TENANT_ID, legendary-arena, 300000); no real tenant URL, no real API key

# Step 13 — render.yaml declares HANKO_* env vars
Select-String -Path "render.yaml" -Pattern "HANKO_(TENANT_BASE_URL|EXPECTED_AUDIENCE|JWKS_REFRESH_INTERVAL_MS)"
# Expected: at least HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE matches

# Step 14 — exactly one catalog row added for createHankoSessionVerifier
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "createHankoSessionVerifier"
# Expected: exactly one match (the new Library-only row)

# Step 15 — D-11201 flipped to Resolved
Select-String -Path "docs\ai\DECISIONS.md" -Pattern "^## D-11201" -Context 0,5
# Expected: status line shows `Resolved` (or equivalent flip from `Active`)

# Step 16 — final scope check
git diff --name-only
# Expected: 12 or 13 files (eight or nine production/reference per D-12601 lock + four governance ledgers)
```

---

## Definition of Done

> Claude Code must execute every verification command in
> `## Verification Steps` before checking any item below. Reading
> the doc is not sufficient — run the commands.
>
> Every item must be true before this packet is considered complete.

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `apps/server/src/auth/hanko/` directory contains exactly five new files (3 production + 2 test) per §Module Layout
- [ ] `createHankoSessionVerifier` factory exported from `apps/server/src/auth/hanko/hankoVerifier.logic.ts` matches the WP-112 `SessionVerifier` contract verbatim
- [ ] F-1..F-7 gate items all PASS (verified by §Verification Steps 4–10 + the §F-1..F-7 acceptance block)
- [ ] No WP-112, WP-052, or WP-099 contract file modified (verified by `git diff`)
- [ ] D-12601 / D-12602 / D-12603 / D-12604 written into `docs/ai/DECISIONS.md` with executor's locked choices
- [ ] D-11201 status flipped `Active` → `Resolved` in `docs/ai/DECISIONS.md`
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries exactly one new `Library-only` row for `createHankoSessionVerifier`
- [ ] `docs/ai/STATUS.md` has a `### WP-126 / EC-NNN Executed` block at the top of `## Current State`
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has a `[x] WP-126` row with today's date and the EC-mode commit hash
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has the EC-NNN row flipped to `Done {YYYY-MM-DD}`
- [ ] No real Hanko tenant URL or API key appears anywhere in the repo (verified by grep against the placeholder convention)
- [ ] No files outside `## Files Expected to Change` were modified

---

## Lint Self-Review (00.3 §1–§21)

> Performed at draft time; re-confirm before execution.

| § | Item | Status |
|---|---|---|
| §1 | All required WP sections present | PASS |
| §1 | `## Out of Scope` non-empty (≥2 items) | PASS (16 items listed) |
| §2 | Non-Negotiable Constraints with engine-wide + packet-specific + session protocol + locked values | PASS |
| §2 | Constraints reference `00.6-code-style.md` | PASS (Engine-wide bullet "Human-style code per ...") |
| §2 | Full file contents required, no diffs/snippets | PASS |
| §3 | `## Assumes` lists prior state and dependency files | PASS |
| §4 | `## Context (Read First)` is specific (no "read the docs") | PASS |
| §4 | Architectural sections cited where relevant | PASS (`.claude/rules/architecture.md`, `.claude/rules/server.md`, ARCHITECTURE.md authority hierarchy) |
| §4 | DECISIONS.md scan instruction included | PASS (D-9901..D-9905, D-11201..D-11204, D-11804, D-5201) |
| §5 | Every file is `new` or `modified` with one-line description | PASS |
| §5 | No ambiguous "update this section" language | PASS |
| §6 | Naming consistency (no abbreviations, canonical paths) | PASS (`apps/server/src/auth/hanko/` per D-9904; `createHankoSessionVerifier` mirrors `createPlayerAccount`; canonical wire-level names per WP-052 / WP-112) |
| §7 | New npm dependencies declared | PASS (`@teamhanko/*` per D-12601, with version-pin and justification at execution) |
| §7 | Forbidden packages explicitly excluded | PASS (Auth0 / Clerk / Passport / bcrypt / argon2 / scrypt forbidden via F-5; top-level JWT libraries forbidden) |
| §8 | Layer boundaries respected | PASS (server-only; no engine import; no `boardgame.io` import; no UI app modification) |
| §9 | Cross-platform commands | PASS (verification uses PowerShell `Select-String` per the WP-112 / WP-104 precedent) |
| §10 | Env vars: declared in `render.yaml` and `.env.example` with placeholders | PASS |
| §11 | Auth: WP-126 IS the auth-broker integration; WP-099 §B is the policy contract | PASS (governance-aligned implementation) |
| §12 | Tests: logic-pure `node:test` + `node:assert`; no live Hanko, no real network | PASS |
| §13 | Verification commands are exact with expected output | PASS |
| §14 | Acceptance criteria are 6–12 binary observable items grouped by sub-task | PASS (8 AC groups, ~40 items total — exceeds 12 because of F-1..F-7 sub-checks; each is binary) |
| §15 | DoD includes STATUS.md + DECISIONS.md + WORK_INDEX.md + scope-boundary check | PASS |
| §16 | Code style: human-style code; small functions; full-sentence errors; `// why:` on non-obvious decisions | PASS (constraints declared; enforcement at execution) |
| §17 | Vision Alignment block present with cited clauses + no-conflict assertion + determinism line | PASS |
| §18 | Prose-vs-grep discipline: forbidden tokens not enumerated verbatim near literal-string greps | PASS (the `'hanko'` grep at Step 4 targets a forbidden literal; nearby prose discusses the gate by name and cites D-9902 / F-1 rather than enumerating quoted variants) |
| §19 | Bridge-vs-HEAD staleness: N/A — this WP is not a repo-state-summarizing artifact | N/A |
| §20 | Funding Surface Gate Trigger: N/A — WP-126 introduces no funding surface. None of the §20.1 trigger surfaces apply: no donate / contribute / sponsor / fund affordances, no registry-viewer funding affordance, no profile funding-attribution surface, no tournament-funding-channel integration, no user-visible copy referencing donate / support / tournament funding. WP-126's subject is auth broker integration, not money flow. The §20.1 governance-doc-exclusion sub-bullet does not need to be invoked because §20 is not triggered in the first place. Per §20.1's strengthened N/A bar (D-9801): this justification names a concrete reason — auth broker vs. funding domain — and is not tautological. | N/A |
| §21 | API Catalog Update: WP-126 adds one new `Library-only` row for `createHankoSessionVerifier` per D-11804. Closed-set Status / Auth taxonomies honored. Field names match 00.2 verbatim. | PASS |

**Final Gate verdict:** PASS at draft time. Re-confirm before
execution by re-running the §1–§21 walkthrough against any
intervening governance changes (none expected — WP-099 / WP-112 /
WP-052 are locked; the four `[DECISION REQUIRED]` items are
executor-time concerns).

---

## Pre-Flight & Copilot Check Review Log

> Applied 2026-05-03 against
> `docs/ai/REFERENCE/01.4-pre-flight-invocation.md` and
> `docs/ai/REFERENCE/01.7-copilot-check.md`. This block captures
> the verdict in the WP body so future readers do not need to
> reconstruct it from the gitignored pre-flight scratchpad
> (`docs/ai/invocations/preflight-wp126.md`, scratchpad-by-default
> per `.claude/rules/work-packets.md`).

### 01.4 Pre-Flight (Infrastructure & Verification class)

WP-126 is classed **Infrastructure & Verification** — server-layer
auth broker integration, no `G` mutation, no boardgame.io move
addition, no phase hook. Mandatory sections per `01.4`: Dependency
Check, Input Data Traceability, Structural Readiness, Scope Lock,
Test Expectations, Risk Review, Runtime Readiness Check, Dependency
Contract Verification, Maintainability & Upgrade Readiness.

- **Authority chain (must read):** `.claude/CLAUDE.md`,
  `docs/ai/ARCHITECTURE.md`, `docs/01-VISION.md`,
  `docs/03.1-DATA-SOURCES.md`,
  `docs/ai/REFERENCE/02-CODE-CATEGORIES.md`, `EC-130`, `WP-126`.
  All confirmed present and consulted.
- **Vision sanity check:** §3 / §11 / §14 / §15 + NG-1 / NG-3 /
  NG-6 cited in §Vision Alignment with explicit no-conflict
  assertion. Determinism N/A (no engine/replay surface). NG
  proximity confirmed clear. PASS.
- **Dependency & sequencing:** WP-099 complete (D-9901..D-9905
  present in `DECISIONS.md`); WP-112 complete and shipped at
  `apps/server/src/auth/sessionToken.{types,logic}.ts` +
  `accountLookup.logic.ts`; WP-052 complete (`AuthProvider` =
  `'email' | 'google' | 'discord'` at
  `apps/server/src/identity/identity.types.ts:149–153`). PASS.
- **Dependency contract verification:**
  - `SessionVerifier` interface verified verbatim at
    `apps/server/src/auth/sessionToken.types.ts:153–155`:
    `verify(token: string): Promise<Result<VerifiedSessionClaim>>`
    (single-parameter `Result<T>`, NOT two-parameter
    `Result<T, E>`).
  - `Result<T>` verified at
    `apps/server/src/identity/identity.types.ts:139–141`: single
    type parameter; failure branch carries `code: IdentityErrorCode`
    hard-wired. WP-112's orchestrator already emits `code` values
    outside `IdentityErrorCode` and casts at the single mapping
    site at `sessionToken.logic.ts:191–193` (`as
    SessionVerificationErrorCode`); WP-126 conforms verbatim to
    this pattern.
  - `apps/server` has no `tsc --noEmit` step in the workflow
    (verified by `apps/server/package.json` carrying only
    `"start"` and `"test"` scripts; `tsx` is the runtime
    transpiler). Structural narrowing mismatches between the
    shipped `Result<T>` and emitted `code` values do not surface
    at build time. WP-126 inherits this posture; widening
    `Result<T>` to `Result<T, E = IdentityErrorCode>` is a
    separate WP-052 contract change, out of WP-126 scope.
  - `VerifiedSessionClaim` shape verified at lines 137–141 of
    `sessionToken.types.ts` (`authProvider`, `authProviderSub`,
    `expiresAt` all `readonly`).
  - `SessionVerificationErrorCode` closed union verified at
    lines 53–57: `'invalid_token' | 'expired_token' |
    'unknown_provider' | 'verification_failed'`.
- **Wiring-Site Infrastructure Singletons check:** N/A — WP-126
  ships the verifier as a library function with no production
  caller (mirrors WP-053 / WP-054 / WP-102 D-10202 fail-closed-
  unwired precedent). No `apps/server/src/server.mjs`
  modification in scope.
- **Input data traceability:** Hanko's JWKS endpoint is an
  external network input. `docs/03.1-DATA-SOURCES.md` does not
  currently list external auth-broker endpoints (it covers card
  data, replay storage, and PostgreSQL rules). PS-N item: at
  execution, the executor evaluates whether to add an entry per
  the WP-097 / WP-098 governance-doc-update precedent. Not
  blocking; the verifier's inputs are operational, not gameplay-
  authoritative.
- **Structural readiness:** all prior WPs build green per
  `pnpm -r build` smoke at draft time (engine + registry-viewer
  + arena-client all complete; server has no build script per
  the inheritance noted above). PASS.
- **Code category boundary:** `apps/server/` is classified
  `server` per `02-CODE-CATEGORIES.md`; `apps/server/src/auth/hanko/`
  inherits the `server` classification. Optional D-12605 entry
  is acceptable per WP-099 §B + the D-5202 / D-10201 / D-10301
  precedent (executor's call at execution time).
- **Scope lock:** five new `apps/server/src/auth/hanko/` files +
  one modified `apps/server/package.json` (or unchanged under
  D-12601 built-ins-only path) + `render.yaml` + `.env.example` +
  `docs/ai/REFERENCE/api-endpoints.md`. Eight or nine production /
  reference files + four governance ledgers = 12 or 13 at session
  close. PASS.
- **Test expectations:** logic-pure `node:test` cases (12–18 for
  `hankoVerifier.logic.test.ts`; 6–10 for `jwksCache.logic.test.ts`).
  Server test baseline `pass 82 / fail 0 / skipped 42` (locked
  at WP-104 close 2026-05-02) is the prior baseline; new cases
  add to this. Engine baseline `pass 604 / fail 0` UNCHANGED. PASS.
- **Mutation boundary:** N/A — no `G` mutation.
- **Risks resolved during pre-flight (PS-#):**
  - **PS-1 (RESOLVED 2026-05-03):** WP-126 spec text in multiple
    places used two-parameter `Result<T, E>` syntax inconsistent
    with the shipped single-parameter `Result<T>` at
    `identity.types.ts:139`. Catalog row response-schema
    reference at WP-126 §API Catalog Update §Required catalog
    update was updated to `Promise<Result<VerifiedSessionClaim>>`
    with the failure-payload `code` discriminant pattern. A new
    Non-Negotiable Constraint locks the single-parameter posture
    and the orchestrator's `as SessionVerificationErrorCode` cast
    site so the executor does not re-derive (cites
    `sessionToken.logic.ts:191–193`).
  - **PS-2 (RESOLVED 2026-05-03):** logic-pure tests had no JWKS
    injection seam — would have required global `fetch`
    stubbing or `undici` mocking to run without real network.
    `JwksCacheConfig` extended with optional `fetcher?:
    JwksFetcher` field; `HankoVerifierConfig` extended likewise
    and forwards it to the inner cache verbatim. Mirrors WP-112's
    caller-injected provider pattern.
  - **PS-3 (RESOLVED 2026-05-03):** `jwksRefreshIntervalMs?:
    number` default-application at factory time was left
    implicit. D-12602 recommended-default block now states
    explicitly that the factory substitutes the D-12603 default
    (5 minutes / 300_000 ms) at exactly one site when the field
    is `undefined`; the cache config seen by `createJwksCache`
    always carries a concrete number.
  - **PS-4 (RESOLVED 2026-05-03):** per copilot-check Issue #17
    ("Hidden Mutation via Aliasing"), `getKey(kid)` returning a
    direct reference to the cache's internal `JsonWebKey` would
    let a misbehaving verifier corrupt the cache. D-12603
    constraints now require either `Object.freeze` at insertion
    or a defensive shallow copy at return; a test case asserts
    non-aliasing.
- **Risks surfaced but not resolved (RS-#, executor-time):**
  - **RS-1:** Hanko's `@teamhanko/*` SDK landscape unverified at
    draft time. D-12601's built-ins-only recommended default
    sidesteps this; if the executor locks the optional SDK path,
    the WP body must record the chosen package + transitive JWT
    libraries. Acceptable.
  - **RS-2:** Hanko's actual session-JWT federation/IdP claim
    shape unverified at draft time. D-12604 no-default lock
    forces the executor to observe a real token (or cite Hanko
    docs) before locking the lookup-table keys. Acceptable.
  - **RS-3:** `apps/server` has no `tsc --noEmit` step in the
    workflow. WP-126 inherits the structural posture; flagging
    a follow-up Foundation-Phase WP to add server typechecking
    is out of WP-126 scope. Acceptable.

**Verdict: READY TO EXECUTE.** PS-1..PS-4 resolved during
pre-flight in-place (scope-neutral spec / constraint
clarifications, no allowlist or boundary change). RS-1 / RS-2 are
documented executor-time concerns with locked recommended defaults
or explicit no-default locks. RS-3 is an inherited posture, out of
WP-126 scope.

### 01.7 Copilot Check (30-issue lens)

| # | Category | Verdict |
|---|---|---|
| 1, 9, 16, 29 | Boundary / Lifecycle | PASS — server-only WP; F-2 grep gates lock containment to `apps/server/src/auth/hanko/`; explicit "no HTTP route registration" + "no orchestrator modification" Out-of-Scope items |
| 2, 8, 23 | Determinism | N/A — no engine / replay / RNG / scoring surface (locked at §Vision Alignment determinism line) |
| 3, 17 | Mutation discipline | PASS — no `G` mutation; PS-4 added defensive-copy / freeze guidance to `JwksCache.getKey` after Issue #17 surfaced aliasing risk |
| 4, 5, 6, 10, 21 | Type / contract integrity | PASS post-PS-1 — single-parameter `Result<T>` aligned with shipped contract; closed-union error codes; no `string`/`any`/`unknown` widening at boundaries; WP-052 `AuthProvider` enum byte-locked |
| 7, 19, 24 | Persistence | PASS — JWKS cache is in-memory only; no `G` field added; `'hanko'` forbidden from `auth_provider` rows / fixtures / types (D-9902 / F-1) |
| 11 | Test invariants | PASS — tests assert per-instance state, single-flight, graceful degradation, and non-aliasing as invariants (not just behavior) |
| 12 | Scope creep | PASS — explicit allowlist with conditional `package.json` modification; `git diff --name-only` verification step; "anything not explicitly allowed is forbidden" framing |
| 13 | Unclassified directories | PASS — `apps/server/src/auth/hanko/` inherits `server` classification per `02-CODE-CATEGORIES.md`; optional D-12605 lock per executor's call (mirrors D-5202 / D-10201 / D-10301 / D-11201 precedent) |
| 14, 28 | Extension / upgrade story | PASS — replacement-safety locked structurally (F-2 + F-6); `SessionVerifier` interface admits any verifier; broker swap is a directory replacement |
| 15 | Why for invariants | PASS — every constraint carries rationale; EC §4 enumerates required `// why:` sites; new D-12603 freeze-or-copy invariant carries a `// why:` requirement |
| 18, 22 | Failure semantics | PASS — closed-union error codes; full-sentence `reason` per Rule 11; fail-closed default per D-11204; verifier-side `expiresAt` defense-in-depth + orchestrator-side canonical lock |
| 20 | Authority chain | PASS — explicit hierarchy citation in §Context (Read First); WP-099 §A / §B / §C / D-9901..D-9905 / WP-112 D-11201..D-11204 cited verbatim |
| 25 | Single responsibility | PASS — `createHankoSessionVerifier` orchestrates verification; `createJwksCache` owns key fetch + cache; mapping-table lookup is its own constant |
| 26 | Implicit semantics | PASS — federation claim → `AuthProvider` mapping is locked under D-12604 (no-default; executor observes real token); JWKS endpoint convention locked |
| 27 | Naming discipline | PASS — `apps/server/src/auth/hanko/` path locked; `'hanko'` literal forbidden as enum value; `createHankoSessionVerifier` mirrors `createPlayerAccount` precedent; canonical wire-level field names per WP-052 |
| 30 | Pre-session governance | PASS — four PS items resolved in-place during pre-flight; three RS items documented as executor-time concerns; D-12601..D-12604 listed as required-at-execution; D-11201 status flip from `Active` → `Resolved` listed in DoD |

**Disposition: CONFIRM.** No `RISK` or `BLOCK` findings outstanding
post-PS-1..PS-4. Pre-flight `READY TO EXECUTE` verdict stands.
Session prompt generation authorized when an executor is assigned.

**Mandatory governance follow-ups at execution (per `01.7`
Required Output Format):**

- DECISIONS.md: D-12601, D-12602, D-12603, D-12604 written with
  executor-locked choices + rejected alternatives + status
  `Active`. D-11201 status flipped `Active` → `Resolved`. Optional
  D-12605 (`apps/server/src/auth/hanko/` directory classification)
  per executor's call.
- 02-CODE-CATEGORIES.md: optional update only if D-12605 is
  written (mirrors D-5202 / D-10201 / D-10301 / D-11201
  precedent of in-DECISIONS.md classification rather than
  direct registry update).
- WORK_INDEX.md: WP-126 row checked off with date + EC-mode
  commit hash; deferred-placeholder text replaced with
  completion summary mirroring WP-104 / WP-112 row format.
- EC_INDEX.md: EC-130 row flipped `Draft` → `Done {YYYY-MM-DD}`.
- 03.1-DATA-SOURCES.md: optional addition documenting Hanko's
  JWKS endpoint as an external operational input (executor's
  call; not blocking per the pre-flight Input Data Traceability
  N/A disposition above).
