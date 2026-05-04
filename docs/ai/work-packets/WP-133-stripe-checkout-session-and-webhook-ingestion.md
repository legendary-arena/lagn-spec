# WP-133 — Stripe Checkout Session Creation & Webhook Ingestion (No Fulfillment)

**Status:** Draft (drafted 2026-05-03; lint-gate self-review **PASS** — see §Lint Self-Review at foot)
**Primary Layer:** Server (`apps/server/src/billing/**`; `data/migrations/012`)
**Dependencies:** WP-052 (`AccountId` brand + `legendary.players` table + `Result<T>` + `DatabaseClient` contracts); WP-112 (`SessionVerifier` interface + `requireAuthenticatedSession` orchestrator + `AccountResolver` caller-injected pattern); WP-115 (long-lived `pg.Pool` lifecycle anchor at `apps/server/src/server.mjs`); WP-118 (HTTP API catalog + `D-11804` update obligation); WP-131 (production wiring of `requireAuthenticatedSession`'s deps — required so `POST /api/billing/checkout-session` is genuinely authenticated rather than fail-closed `'session_verifier_not_configured'`); **WP-132 (entitlement substrate — `legendary.entitlements` table + `EntitlementKey` closed union; the price-id-to-entitlement-key allowlist in WP-133 names `EntitlementKey` values WP-132 locked)**.

**Slot note:** WP-128..WP-131 reserved per the board-layout chain + auth-wiring WP. WP-132 reserves EC-135 + migration slot 011. WP-133 + EC-136 + migration slot 012 is the next free trio.

---

## Session Context

WP-132 (executed at WP-132 close, prerequisite to WP-133) shipped the
`legendary.entitlements` table, the `EntitlementKey` closed union, the
`getEntitlementsForAccount` helper, and the read-only `GET /api/me/entitlements`
endpoint. WP-132 deliberately ships zero entitlement grant path — that path
lands in WP-134.

This packet introduces the **Stripe wiring half** of the monetization
flow without any consequence on entitlement state. WP-133 ships:

- A new module `apps/server/src/billing/` with `billing.types.ts`,
  `billing.logic.ts`, `billing.routes.ts`, and matching test files —
  mirrors the WP-104 / WP-132 sibling-flat module structure.
- A new migration `data/migrations/012_create_stripe_events_and_checkout_sessions.sql`
  creating `legendary.stripe_events` (one row per received Stripe event,
  UNIQUE on Stripe `event_id`, `processed_at` nullable so WP-134 can
  flip it) and `legendary.stripe_checkout_sessions` (one row per
  Stripe Checkout Session created by `POST /api/billing/checkout-session`,
  UNIQUE on Stripe `session_id`, carries the `account_id` and the
  `price_id` for fulfillment-time lookup).
- Two new HTTP endpoints:
  - `POST /api/billing/checkout-session` — `authenticated-session-required`;
    body lists a `priceId` from the env-configured allowlist; the
    handler calls Stripe to create a Checkout Session with
    `client_reference_id = <accountId>` and
    `metadata = { accountId, entitlementKey }`; INSERTs a row into
    `legendary.stripe_checkout_sessions`; returns
    `{ checkoutUrl, sessionId }` on success.
  - `POST /api/billing/webhook/stripe` — `guest` (Stripe signature is
    the auth); raw-body middleware verifies the
    `Stripe-Signature` header against the raw bytes via
    `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`;
    INSERTs a row into `legendary.stripe_events` with `ON CONFLICT
    (event_id) DO NOTHING` (idempotent ingestion); returns 200 quickly.
    **WP-133's webhook handler does NOT call any fulfillment logic.**
- New env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_ALLOWLIST` (comma-separated `price_*` values, each
  mapped to one `EntitlementKey` via the in-tree map locked under
  D-DEC-5).
- One new npm dependency: `stripe` (Node SDK; exact version locked
  under D-DEC-3).

WP-133 is **fulfillment-blind by construction**. The webhook handler
records events; it does not grant entitlements. WP-134 reads
unprocessed `legendary.stripe_events` rows and writes to
`legendary.entitlements`. Splitting ingestion from fulfillment lets
WP-133 ship Stripe wiring + the events log + the recorded-but-not-acted
posture without coupling the operational risk of database writes
during webhook handling to the operational risk of new payment-provider
SDK code.

**Scope deliberately excluded from this packet:**
- Fulfillment processor (event → entitlement INSERT) — **WP-134**.
- Stripe Customer Portal (subscription self-management) — future WP.
- Subscriptions / recurring billing — out of scope; MVP is one-time
  purchases only per D-DEC-7 (see Decision Points).
- Refund / reversal handling — out of scope; future WP.
- Profile-page "Upgrade" button or any arena-client UI — out of
  scope; future arena-client WP that consumes `POST /api/billing/checkout-session`.
- Multi-currency, tax automation, VAT compliance — out of scope.
- Invoice generation / receipts — out of scope (Stripe-hosted
  Checkout's receipt email covers MVP).

---

## Goal

After this session:

- A new migration `data/migrations/012_create_stripe_events_and_checkout_sessions.sql`
  creates two tables idempotently:
  - `legendary.stripe_events` (`id bigserial PK`, `event_id text NOT
    NULL UNIQUE`, `event_type text NOT NULL`, `payload jsonb NOT
    NULL`, `received_at timestamptz NOT NULL DEFAULT now()`,
    `processed_at timestamptz NULL`, `process_error text NULL`).
  - `legendary.stripe_checkout_sessions` (`id bigserial PK`,
    `session_id text NOT NULL UNIQUE`, `account_id text NOT NULL
    REFERENCES legendary.players(account_id) ON DELETE CASCADE`,
    `price_id text NOT NULL`, `entitlement_key text NOT NULL`
    (denormalized for WP-134 lookup), `intent_status text NOT
    NULL CHECK (intent_status IN ('open', 'completed', 'expired',
    'canceled'))`, `created_at timestamptz NOT NULL DEFAULT now()`,
    `completed_at timestamptz NULL`).
- A new `apps/server/src/billing/` quintet:
  - `billing.types.ts` — `CheckoutSessionRequest`, `CheckoutSessionResponse`,
    `BillingResult<T>`, `BillingErrorCode`, `StripeEventRecord`,
    `PriceAllowlistEntry`.
  - `billing.config.ts` — `loadBillingConfig(env)` reads the three
    env vars + parses the `STRIPE_PRICE_ALLOWLIST` into a typed
    `Map<string, EntitlementKey>`. Production-mode missing-env path
    is fatal (mirrors WP-131 production guard); non-production
    missing-env path leaves `billingConfig: undefined` so the
    routes return 503 fail-closed.
  - `billing.logic.ts` — `createCheckoutSession(accountId, priceId,
    config, database, stripeClient): Promise<BillingResult<{ url,
    sessionId }>>` (pure logic given an injected Stripe client) +
    `recordStripeEvent(event, database): Promise<BillingResult<{
    inserted: boolean }>>`.
  - `billing.routes.ts` — `registerBillingRoutes(router, pool, deps)`
    registers both routes. The webhook route runs the raw-body
    parser BEFORE any global JSON parser (per D-DEC-4); the
    checkout-session route runs `requireAuthenticatedSession` first.
  - Test files: `billing.logic.test.ts`, `billing.routes.test.ts`,
    `billing.config.test.ts`.
- A `server.mjs` modification calling
  `registerBillingRoutes(server.router, pool, {
  requireAuthenticatedSession, verifier, accountResolver,
  billingConfig, stripeClient })` — the `billingConfig` and
  `stripeClient` deps are constructed once at startup from the env
  vars (mirrors WP-126 / WP-131 startup-construction pattern).
- A `package.json` modification adding the `stripe` Node SDK at the
  exact version locked under D-DEC-3.
- A `render.yaml` + `.env.example` modification documenting the
  three new env vars (mirrors WP-126 / WP-131 env-var precedent).

**Invariant locked here:** WP-133's webhook handler writes only to
`legendary.stripe_events`. Tests assert via `Select-String`:
`apps\server\src\billing\billing.routes.ts` MUST NOT contain
`INSERT INTO legendary.entitlements` or any SQL targeting that
table — that path lands in WP-134.

**Invariant locked here (intent_status lifecycle ownership):**
WP-133 only ever INSERTs `legendary.stripe_checkout_sessions` rows
with `intent_status = 'open'` (the migration default). WP-133
introduces NO code path that UPDATEs `intent_status` or
`completed_at`. All transitions of `intent_status` (`'open'` →
`'completed'` / `'expired'` / `'canceled'`) and all writes to
`completed_at` are owned by **WP-134** and gated on
verified Stripe events. A future engineer fixing "missing status
transitions" in WP-133 would be wrong — the deferral is
intentional; rejecting their PR is the correct response. Tests
assert via `Select-String` that no `UPDATE legendary.stripe_checkout_sessions
SET intent_status` clause appears anywhere under
`apps/server/src/billing/` at WP-133 close.

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. WP-133
> touches monetization (Vision §765–794 Financial Sustainability +
> NG-1..NG-7) and introduces a payment-provider integration. Vision
> Alignment is mandatory.

**Vision clauses touched:** §3 (Player Trust & Fairness), §11
(Stateless Client Philosophy), §14 (Explicit Decisions, No Silent
Drift), §15 (Built for Contributors), §765–794 (Financial
Sustainability — specifically streams #1 supporter subscriptions
[deferred per D-DEC-7] and #2 one-time cosmetic purchases [WP-133's
MVP scope]), Non-Goals NG-1, NG-2, NG-3, NG-4, NG-5, NG-6, NG-7.

**Conflict assertion:** **No conflict: this WP preserves all touched
clauses.**

- **§3 Player Trust & Fairness.** The `priceId` in the request body
  is validated against the env-configured allowlist BEFORE any
  Stripe API call. A client cannot construct a Checkout Session
  for an arbitrary Stripe price; only allowlist members are
  acceptable. The allowlist is loaded once at startup (per the
  WP-131 startup-construction pattern), never mutated at runtime,
  and never read from request input.
- **§11 Stateless Client Philosophy.** The client never holds the
  Stripe secret. The client posts `priceId`; the server creates
  the Checkout Session and returns the redirect URL; Stripe-hosted
  Checkout collects payment; the webhook records the event. The
  client never sees `STRIPE_SECRET_KEY`, never sees the webhook
  body, and never adjudicates fulfillment.
- **§14 Explicit Decisions, No Silent Drift.** Eight Decision
  Points are surfaced in §Decision Points. The Stripe SDK version
  is pinned (D-DEC-3); the price allowlist source and shape is
  locked (D-DEC-5); the raw-body middleware ordering is locked
  (D-DEC-4); the webhook idempotency key is locked (`event_id`
  UNIQUE per D-DEC-6).
- **§15 Built for Contributors.** A contributor running locally
  without `STRIPE_SECRET_KEY` configured sees a recognizable 503
  with `code: 'billing_not_configured'` on every billing route —
  not silent success, not opaque 500. Production startup fails
  loudly if the env vars are unset (mirrors WP-131 / WP-126
  production guard).
- **§765–794 Financial Sustainability.** WP-133 implements the
  Stripe wiring for stream #2 (one-time cosmetic purchases) at
  MVP. Stream #1 (recurring subscriptions) is deferred per
  D-DEC-7 — the schema accommodates subscription lifecycle events
  but no code path subscribes today. Streams #3 and #4 (donations,
  enterprise licensing) are not addressed by WP-133.

**Non-Goal proximity check:** Confirmed clear.

- **NG-1 (pay-to-win):** The price allowlist maps every accepted
  `priceId` to an `EntitlementKey` from the WP-132-locked closed
  set. WP-132's closed set is cosmetic-only at D-DEC-3. A
  `priceId` mapped to a gameplay-affecting `EntitlementKey` would
  fail at the type level — `EntitlementKey` cannot include
  gameplay values without a Vision-Alignment-reviewed WP. WP-133
  inherits the cosmetic-only invariant by construction.
- **NG-2 (gacha):** Stripe Checkout is deterministic, fully-disclosed
  one-time purchase. No randomized outcomes, no card packs, no
  RNG tied to ownership.
- **NG-3 (content withheld):** Per the WP-132 §17 analysis, the
  closed-set `EntitlementKey` covers cosmetic flair only. Core
  game content remains permanently free.
- **NG-4 (energy / fatigue):** No time gates, no resets, no
  daily-purchase limits.
- **NG-5 (advertising):** Stripe-hosted Checkout shows only the
  product description we configure on the Stripe dashboard. No
  ad surfaces.
- **NG-6 (dark patterns):** No FOMO timers in the WP-133 surface.
  The `intent_status` column tracks `'open'` / `'completed'` /
  `'expired'` / `'canceled'` for forensics; no client-visible
  countdown is rendered.
- **NG-7 (apologetic monetization):** Allowlist + closed-set
  enforcement makes "feature creep into pay-to-win" mechanically
  infeasible without a Vision review WP.

**Determinism preservation:** **N/A.** WP-133 touches no engine,
registry, scoring, replay, RNG, or simulation surface.
Authentication-gated checkout creation and Stripe-signature-gated
webhook ingestion are server-layer access concerns. The engine
never imports from `apps/server/src/billing/` (Layer Boundary
enforcement). Replay determinism (Vision §22, §24) unaffected by
construction.

---

## Funding Surface Gate (§20)

**§20 N/A.** **Justification:** WP-097 / D-9701 / D-9801 anchor §20
to **tournament-funding** affordances (Open Collective / PayPal /
equivalent per `docs/TOURNAMENT-FUNDING.md`). WP-133 introduces
exactly **paid-tier purchase plumbing** for Vision §784–794 stream
#2 (one-time cosmetic purchases) — the user-visible label on the
future "Upgrade" button (a separate arena-client WP) is "Become a
Legendary Supporter", not "donate" / "support tournaments". Per
§20.1 trigger (e), the user-visible-copy trigger fires on copy
referencing donate / tournament-funding terms; "Become a Legendary
Supporter" is purchase-tier copy, not donation copy. None of
WP-097 §A / §B / §C / §D / §E surfaces are touched: WP-133 introduces
no global navigation funding affordance, no registry-viewer funding
surface, no profile funding-attribution surface (WP-133 ships
backend-only routes, not UI), no tournament-specific funding
integration. The future arena-client WP that adds the "Upgrade"
button is a separate WP that will need to declare §20 N/A with its
own justification (purchase-tier copy, not donate-flow copy).

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

WP-133 adds two new HTTP endpoints, so §21 fires.

**Required catalog update:** Add two rows in `## Wired — Reachable
Over HTTP Today → ### Server-Registered Routes`:

- **`POST /api/billing/checkout-session`** — `authenticated-session-required`
  per D-9905; request body `{ priceId: string }`; response
  `{ checkoutUrl: string, sessionId: string }`; 400 with `code:
  'invalid_price'` on disallowed `priceId`; 401 with `code:
  'unauthorized'` on auth failure; 500 with `code:
  'session_verifier_not_configured'` until WP-131 lands; 500 with
  `code: 'stripe_error'` on Stripe API fault; 503 with `code:
  'billing_not_configured'` when env vars unset (non-production);
  status-code domain `{200, 400, 401, 500, 503}`.
  `Authorizing WP: WP-133`. `Cache-Control: no-store` first
  statement of every response.
- **`POST /api/billing/webhook/stripe`** — `guest` (Stripe signature
  IS the auth, per the WP-115 `guest`-with-server-side-validation
  precedent); request body raw bytes (NOT JSON); response 200 with
  body `{ received: true, duplicate: boolean }` on signature-verified
  event (`duplicate: true` indicates the `event_id` was already
  recorded — Stripe at-least-once retry — and the new INSERT was a
  no-op via `ON CONFLICT DO NOTHING`); 400 with `code:
  'invalid_signature'` on signature failure; 500 with `code:
  'internal_error'` on unhandled DB fault; status-code domain
  `{200, 400, 500}`. `Authorizing WP: WP-133`. `Cache-Control:
  no-store` first statement. (WP-134 extends this response to
  `{ received: true, duplicate: boolean, processed: boolean,
  reason: string | null }` per WP-134 D-DEC-2 — full row
  replacement at WP-134 close per D-11804.)

**Replace-whole-row semantics (per D-11804):** insertions of new
rows; replace-whole-row pattern N/A.

---

## Assumes

- WP-052 / WP-112 / WP-115 / WP-118 complete (per WP-132 §Assumes).
- WP-132 complete. Specifically:
  - `apps/server/src/entitlements/entitlements.types.ts` exports
    `EntitlementKey` (closed union) + `ENTITLEMENT_KEYS` (canonical
    array).
  - `legendary.entitlements` table exists.
- WP-131 IDEALLY complete. If not, WP-133's checkout-session route
  returns 500 with `code: 'session_verifier_not_configured'` per
  D-11204 (matches WP-104 / WP-109 / WP-132 fail-closed posture).
  WP-133 is not blocked by WP-131; webhook ingestion (the
  `guest` route) works regardless.
- Stripe account exists with API keys provisioned. Test-mode keys
  available for local development.
- `pnpm --filter @legendary-arena/server build` exits 0
- `pnpm --filter @legendary-arena/server test` exits 0
- Migrations 001..011 applied; slot 012 unused.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirm
  `apps/server/src/billing/` belongs in the Server layer; engine /
  registry / preplan / arena-client packages MUST NOT import from
  it; the `stripe` SDK is a server-only dependency.
- `docs/ai/ARCHITECTURE.md §Persistence Boundary` —
  `legendary.stripe_events` and `legendary.stripe_checkout_sessions`
  are server-owned; never read from the engine.
- `.claude/rules/architecture.md "Layer Boundary"` — mirror enforcement.
- `docs/ai/work-packets/WP-104-owner-profile-data-model-and-me-edit.md` —
  module-structure precedent; route registration shape; closed-set
  CHECK constraint precedent.
- `docs/ai/work-packets/WP-115-public-leaderboard-http-endpoints.md` —
  long-lived `pg.Pool` precedent; `Cache-Control: no-store` posture;
  project-owned 500 envelope.
- `docs/ai/work-packets/WP-126-hanko-session-verifier.md` — startup
  env-var construction pattern; production-mode fatal-on-missing-env
  guard; per-instance config object pattern.
- `docs/ai/work-packets/WP-131-authenticated-routes-production-wiring.md` —
  the `verifier` + `accountResolver` deps bundle WP-133 inherits.
- `docs/ai/work-packets/WP-132-entitlements-data-model-and-me-read.md` —
  the `EntitlementKey` closed union WP-133's allowlist references.
- `docs/ai/REFERENCE/api-endpoints.md` — current catalog state.
- `docs/ai/REFERENCE/00.2-data-requirements.md §4` — add
  `legendary.stripe_events` + `legendary.stripe_checkout_sessions`
  rows to the inventory in the same commit.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4 / 6 / 9 / 11 / 13 / 14.
- `docs/01-VISION.md §765–794 Financial Sustainability` + §NG-1..NG-7.
- `docs/ai/DECISIONS.md` — scan for D-12601..D-12604 (WP-126 startup
  env-var precedent); D-13201..D-13206 (WP-132 entitlement closed
  set); D-9905 (auth taxonomy); D-11804 (catalog update).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — `ctx.random.*` only (N/A here; no engine code)
- Never throw inside boardgame.io move functions (N/A here)
- Never persist `G`, `ctx`, or runtime state — see ARCHITECTURE.md
- `G` JSON-serializable (N/A here)
- ESM only, Node v22+
- `node:` prefix on built-ins
- Test files use `.test.ts`
- Full file contents for every new or modified file
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- The Stripe SDK MUST be imported only from
  `apps/server/src/billing/`. Confirmed via `Select-String`
  recursive grep over `apps/`, `packages/`, `data/migrations/`
  for `from 'stripe'` outside the billing directory; expected
  zero matches outside `apps/server/src/billing/`.
- The `priceId` value submitted by the client MUST be validated
  against the env-configured allowlist BEFORE any Stripe API
  call. A `priceId` not in the allowlist returns 400 with `code:
  'invalid_price'` and `message: 'Requested price ID is not in
  the configured allowlist; no Stripe call was made.'` Tests
  assert this branch with a fake `stripeClient` that throws if
  invoked.
- The webhook handler MUST verify the `Stripe-Signature` header
  against the **raw request body** via
  `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`.
  Tests assert that a tampered body or wrong signature returns
  400. The raw-body middleware MUST be applied to the webhook
  route BEFORE any global JSON parser; D-DEC-4 locks the
  approach (route-level raw-body via `koa-body` raw mode, scoped
  to the webhook path).
- The webhook handler MUST NOT call any fulfillment logic. Its
  ONLY database mutation is `INSERT INTO legendary.stripe_events
  (...) ON CONFLICT (event_id) DO NOTHING`. Tests assert via
  `Select-String` that `INSERT INTO legendary.entitlements`
  appears nowhere under `apps/server/src/billing/`.
- The webhook handler MUST return 200 within a Stripe-acceptable
  window (Stripe retries on 5xx and on > 30s). Tests assert that
  the handler does not perform synchronous Stripe API calls or
  blocking external work after signature verification.
- Production-mode startup MUST fail loudly when any of the three
  required env vars is missing (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ALLOWLIST`). Mirrors
  WP-131 / WP-126 startup guard.
- The `legendary.stripe_events` row's `payload` column stores the
  raw event body as `jsonb`; tests assert that the raw bytes
  `JSON.parse`-roundtrip identical to the stored row.
- No new npm dependencies beyond `stripe` (Node SDK). The exact
  version is locked under D-DEC-3.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask
  the human before proceeding — never guess or invent.

**Locked contract values:**

- **`legendary.stripe_events` columns:** `id bigserial PK`,
  `event_id text NOT NULL UNIQUE`, `event_type text NOT NULL`,
  `payload jsonb NOT NULL`, `received_at timestamptz NOT NULL
  DEFAULT now()`, `processed_at timestamptz NULL`, `process_error
  text NULL`.
- **`stripe_events.payload` contract:** the value stored in
  `payload` is the **full Stripe event object** as returned by
  `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)` —
  serialized via `JSON.stringify(event)`. The stored JSON
  preserves the entire envelope: `{ id, object, api_version,
  created, type, data: { object: {...}, previous_attributes: ... },
  livemode, pending_webhooks, request, ... }`. WP-133 stores the
  event **verbatim**; it never extracts `event.data.object` or any
  inner field for storage. This shape is locked because WP-134's
  fulfillment parser reads `payload.data.object.payment_status`,
  `payload.data.object.client_reference_id`, `payload.data.object.metadata`,
  and `payload.data.object.id` — all of which are inner fields the
  full envelope preserves. Storing only `event.data.object` would
  satisfy WP-134's needs at MVP but loses the envelope's
  `api_version` field, which is the forensic signal for
  Stripe-side API version drift. Verbatim storage is the safe
  default.
- **`legendary.stripe_checkout_sessions` columns:** `id bigserial
  PK`, `session_id text NOT NULL UNIQUE`, `account_id text NOT
  NULL REFERENCES legendary.players(account_id) ON DELETE CASCADE`,
  `price_id text NOT NULL`, `entitlement_key text NOT NULL`,
  `intent_status text NOT NULL CHECK (intent_status IN ('open',
  'completed', 'expired', 'canceled'))`, `created_at timestamptz
  NOT NULL DEFAULT now()`, `completed_at timestamptz NULL`.
- **HTTP routes:** `POST /api/billing/checkout-session` (auth),
  `POST /api/billing/webhook/stripe` (guest).
- **Module path:** `apps/server/src/billing/` (per D-DEC-1).
- **Migration slot:** `012_create_stripe_events_and_checkout_sessions.sql` (per D-DEC-2).
- **New env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_ALLOWLIST`. `STRIPE_PRICE_ALLOWLIST` format:
  comma-separated `priceId:entitlementKey` pairs (e.g.,
  `price_1ABC...:supporter_tier_basic_2026,price_1DEF...:cosmetic_playmat_comic`).
  Parser validates every `entitlementKey` is a member of
  `ENTITLEMENT_KEYS`; startup fails loudly on parse error.
- **New npm dependency:** `stripe` SDK (exact version per D-DEC-3
  recommended default — executor confirms current published
  version at execution time).
- **`BillingErrorCode` closed union:** `'unauthorized' |
  'session_verifier_not_configured' | 'invalid_price' |
  'stripe_error' | 'invalid_signature' | 'billing_not_configured'
  | 'internal_error'`.

---

## Debuggability & Diagnostics

- Every Stripe API call captures `{ requestId: stripe.lastResponse.requestId }`
  in the database row's `process_error` field on failure (per
  Stripe's documented `req_*` request-id convention) so support
  can grep across the Stripe dashboard and the local DB.
- The `legendary.stripe_events` table is the single source of
  truth for "did Stripe send us this event"; replaying past
  events is a SQL `SELECT ... WHERE processed_at IS NULL` away
  (WP-134 owns the read).
- The webhook signature failure path returns a deterministic
  error code `'invalid_signature'` — never silent 200, never
  silent 500, so probe traffic and tampered traffic are
  distinguishable in logs.
- `Cache-Control: no-store` on every response (mirrors WP-115).
- Production startup logs (without secrets) the count of
  configured price allowlist entries — `[billing] startup:
  loaded 6 price-allowlist entries` — so misconfiguration is
  visible without disclosing secret values.

---

## Scope (In)

### A) Migration

`data/migrations/012_create_stripe_events_and_checkout_sessions.sql` — new:
- `CREATE TABLE IF NOT EXISTS legendary.stripe_events (...)` per
  Locked contract values.
- `CREATE TABLE IF NOT EXISTS legendary.stripe_checkout_sessions (...)`.
- `CREATE INDEX IF NOT EXISTS stripe_events_unprocessed_idx ON
  legendary.stripe_events (received_at) WHERE processed_at IS
  NULL;` (WP-134 reads via this index).
- `CREATE INDEX IF NOT EXISTS stripe_checkout_sessions_account_idx
  ON legendary.stripe_checkout_sessions (account_id);`.
- `// why:` SQL comments on the partial index (WP-134 lookup) and
  the `intent_status` CHECK (closed set).

### B) `apps/server/src/billing/billing.types.ts` — new

- `CheckoutSessionRequest = { priceId: string }`.
- `CheckoutSessionResponse = { checkoutUrl: string; sessionId:
  string }`.
- `BillingErrorCode` per Locked contract values.
- `BillingResult<T>` mirror of WP-052 `Result<T>`.
- `StripeEventRecord = { id: bigint; eventId: string; eventType:
  string; payload: unknown; receivedAt: string; processedAt:
  string | null; processError: string | null }`.
- `PriceAllowlistEntry = { priceId: string; entitlementKey:
  EntitlementKey }`.
- `BillingConfig = { stripeSecretKey: string; webhookSecret:
  string; priceAllowlist: ReadonlyMap<string, EntitlementKey> }`.

### C) `apps/server/src/billing/billing.config.ts` — new

- `loadBillingConfig(env: NodeJS.ProcessEnv): BillingConfig | undefined`.
- Reads `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_ALLOWLIST`.
- Parses `STRIPE_PRICE_ALLOWLIST` via `parsePriceAllowlist(raw:
  string): ReadonlyMap<string, EntitlementKey>`. Each pair
  validated against `ENTITLEMENT_KEYS` (imported from WP-132's
  `entitlements.types.ts`).
- The returned `BillingConfig` is wrapped in `Object.freeze(...)`
  before return so the wrapper's three properties cannot be
  reassigned at runtime. The compile-time `ReadonlyMap<string,
  EntitlementKey>` typing prevents `.set()` calls on the allowlist
  in TypeScript; runtime mutation via `(config.priceAllowlist as
  Map<string, EntitlementKey>).set(...)` would be an explicit cast
  (loud in code review). The `parsePriceAllowlist` helper returns
  the Map directly — no separate "frozen Map" abstraction is
  introduced. `// why:` comment on the `Object.freeze` call:
  `// why: Pricing policy must change only via deploy + DECISION
  entry; freeze the BillingConfig wrapper so a future code path
  cannot reassign priceAllowlist mid-request. Combined with
  ReadonlyMap typing, this catches both reassignment bugs and
  accidental .set() calls (the latter via TS, the former via
  runtime freeze).`
- Production-mode missing-env throws (server.mjs catches and
  exits 1, mirroring `loadRegistry` posture).
- Non-production missing-env returns `undefined`; routes return
  503 fail-closed.
- `// why:` comment on the production-mode-fatal branch citing
  the WP-126 / WP-131 startup-guard precedent.

### D) `apps/server/src/billing/billing.logic.ts` — new

- `createCheckoutSession(args)` where `args = { accountId,
  priceId, billingConfig, database, stripeClient,
  successUrl, cancelUrl }`. Validates `priceId` against allowlist
  → if miss returns `Result.fail({ code: 'invalid_price' })`.
  Calls `stripeClient.checkout.sessions.create({ ... mode:
  'payment', client_reference_id: accountId, metadata: {
  accountId, entitlementKey } })`. INSERTs row in
  `legendary.stripe_checkout_sessions`. Returns `Result.ok({ url,
  sessionId })`.
- **`successUrl` and `cancelUrl` are server-derived ONLY.** They
  are constructed from server configuration (e.g.,
  `${process.env.PUBLIC_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`
  and `${process.env.PUBLIC_BASE_URL}/billing/cancel`) at the route
  layer before being passed into `createCheckoutSession`. The
  `POST /api/billing/checkout-session` request body MUST NOT
  include any `successUrl` / `cancelUrl` field — accepting either
  from request input would permit a redirect-manipulation attack
  (an attacker submits a checkout session with `successUrl =
  attacker.example/phish`; the user pays at Stripe-hosted Checkout
  and is then redirected to the attacker's page bearing the
  appearance of a successful purchase). Tests assert that the
  request body shape is exactly `{ priceId: string }` and that
  any extra field returns 400 with `code: 'invalid_request'`. The
  exact `PUBLIC_BASE_URL` env var (or fixed server constant)
  source is locked at execution close as part of D-13301..D-13309
  governance — D-DEC-9 below surfaces this for executor lock-in.
- `recordStripeEvent({ event, database }): Promise<BillingResult<{
  inserted: boolean }>>`. INSERTs into `legendary.stripe_events`
  with `ON CONFLICT (event_id) DO NOTHING`. `inserted: false`
  signals duplicate delivery (Stripe retried).
- **No call to entitlement INSERT.** WP-134 owns that path.

### E) `apps/server/src/billing/billing.routes.ts` — new

- `registerBillingRoutes(router, pool, deps)`. `deps`:
  `{ requireAuthenticatedSession, verifier, accountResolver,
  billingConfig, stripeClient }`. Identical caller-injected
  pattern to WP-104 / WP-109 / WP-132.
- `POST /api/billing/checkout-session` handler:
  - `Cache-Control: no-store` first statement.
  - If `billingConfig === undefined`: 503 with `code:
    'billing_not_configured'` and operator-facing diagnostic in
    `message`.
  - `await deps.requireAuthenticatedSession(req, ...)`.
  - On auth failure: 401 `'unauthorized'` or 500
    `'session_verifier_not_configured'`.
  - On auth success: parse `req.body` for `priceId` (string);
    400 with `code: 'invalid_request'` on shape mismatch.
  - Call `createCheckoutSession({ accountId, priceId, ... })`.
  - 200 `{ checkoutUrl, sessionId }` on `Result.ok`; otherwise
    map error codes per Locked contract values.
- `POST /api/billing/webhook/stripe` handler:
  - `Cache-Control: no-store` first statement.
  - Raw-body parser (route-level per D-DEC-4) populates
    `ctx.request.rawBody`.
  - `stripeClient.webhooks.constructEvent(ctx.request.rawBody,
    ctx.request.headers['stripe-signature'],
    billingConfig.webhookSecret)` — throws on bad signature →
    400 `'invalid_signature'`.
  - On verified event: `recordStripeEvent({ event, database:
    pool })`. Returns 200 `{ received: true, duplicate:
    !inserted }`.
  - On `recordStripeEvent` fault: 500 `'internal_error'` (Stripe
    will retry; idempotency key on `event_id` UNIQUE makes the
    retry safe).

### F) Tests

- `billing.config.test.ts` — production-mode missing-env throws;
  non-production missing-env returns `undefined`; valid env
  parses into `Map<string, EntitlementKey>`; allowlist entry
  with non-member `entitlementKey` throws.
- `billing.logic.test.ts` — `createCheckoutSession` invalid
  `priceId` → `Result.fail('invalid_price')` and stripe client
  not invoked; valid priceId → stripe client invoked with
  correct args + DB row inserted; Stripe SDK error mapped to
  `'stripe_error'`. `recordStripeEvent` first INSERT returns
  `inserted: true`; duplicate event_id returns `inserted:
  false`.
- `billing.routes.test.ts` — checkout-session: 200 happy-path
  with stub Stripe client; 400 on bad priceId; 401 unauthorized;
  500 unconfigured-verifier; 503 billing-not-configured.
  Webhook: 200 on signature-verified event; 400 on bad
  signature; 200 on duplicate event.

### G) `apps/server/src/server.mjs` — modified

- Construct `billingConfig = loadBillingConfig(process.env)` once
  at startup (production-mode-fatal on missing env).
- Construct `stripeClient = new Stripe(billingConfig.stripeSecretKey,
  { apiVersion: <pinned>, typescript: true })` once at startup
  when `billingConfig` is defined.
- Add single line:
  `registerBillingRoutes(server.router, pool, {
  requireAuthenticatedSession, verifier, accountResolver,
  billingConfig, stripeClient });` adjacent to existing
  `registerEntitlementRoutes(...)` call (or
  `registerOwnerProfileRoutes(...)` if WP-132 has not yet landed
  per dependency check).

### H) `package.json` — modified

- Add `"stripe": "<exact version per D-DEC-3>"` to
  `apps/server/package.json` `dependencies`.
- Run `pnpm install` to produce a deterministic `pnpm-lock.yaml`
  update; commit both.

### I) `.env.example` + `render.yaml` — modified

- `.env.example`: add the three new variables with `<placeholder>`
  values plus a brief comment on what each is.
- `render.yaml`: add the three under `envVars`, marked
  `sync: false` (provisioned via Render dashboard, never in repo
  per the WP-126 precedent).

### J) Catalog + governance updates

- `docs/ai/REFERENCE/api-endpoints.md` — two new `Wired` rows.
- `docs/ai/REFERENCE/00.2-data-requirements.md §4` — add
  `legendary.stripe_events` and `legendary.stripe_checkout_sessions`
  rows.
- `docs/ai/STATUS.md` — append WP-133 close entry.
- `docs/ai/DECISIONS.md` — append D-13301..D-13309.
- `docs/ai/work-packets/WORK_INDEX.md` — check off WP-133.

---

## Out of Scope

- Fulfillment processor (Stripe event → `legendary.entitlements`
  INSERT) — **WP-134**.
- Stripe Customer Portal (subscription self-management) — future WP.
- Subscriptions / recurring billing — out of scope per D-DEC-7;
  one-time purchases only at MVP.
- Refunds, partial refunds, disputes, chargebacks — future WP.
- Profile-page "Upgrade" UI button or any arena-client surface —
  future WP.
- Multi-currency / localization / VAT / tax-engine integration —
  out of scope.
- Webhook backfill / replay tooling — future WP (`scripts/replay-stripe-events.mjs`).
- Refactors, cleanups, or "while I'm here" improvements are out
  of scope unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

- `data/migrations/012_create_stripe_events_and_checkout_sessions.sql` — **new**
- `apps/server/src/billing/billing.types.ts` — **new**
- `apps/server/src/billing/billing.config.ts` — **new**
- `apps/server/src/billing/billing.config.test.ts` — **new**
- `apps/server/src/billing/billing.logic.ts` — **new**
- `apps/server/src/billing/billing.logic.test.ts` — **new**
- `apps/server/src/billing/billing.routes.ts` — **new**
- `apps/server/src/billing/billing.routes.test.ts` — **new**
- `apps/server/src/server.mjs` — **modified** — env load + Stripe client construct + register call
- `apps/server/package.json` — **modified** — add `stripe` dep
- `pnpm-lock.yaml` — **modified** — `pnpm install` regenerates
- `.env.example` — **modified** — three new vars with placeholders
- `render.yaml` — **modified** — three new vars marked `sync: false`; a fourth (`PUBLIC_BASE_URL`) is added if executor locks D-DEC-9 = (a)
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — two new `Wired` rows
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **modified** — two new table rows in §4
- `docs/ai/STATUS.md` — **modified** — append WP-133 close entry
- `docs/ai/DECISIONS.md` — **modified** — append D-13301..D-13309
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-133

No other files may be modified.

---

## Decision Points

> Nine decisions surfaced. **D-13301** + **D-13302** locked at draft
> (module path + migration slot per WP-104 / WP-132 precedent).
> **D-13303** locks the Stripe SDK version after executor checks
> current published version. **D-13304..D-13308** are `[DECISION
> REQUIRED]` blocks for executor lock-in. Renumbered as
> D-13301..D-13309 in `DECISIONS.md` at close.

### D-DEC-1 — Module Path: `apps/server/src/billing/` [LOCKED AT DRAFT]

**Decision:** Stripe wiring lives under `apps/server/src/billing/`
as a sibling of `entitlements/` (WP-132). Stripe is the payment
provider; entitlements are the granted-benefits substrate. Splitting
them at the directory level keeps the entitlement substrate
provider-agnostic (a future second provider, or the WP-134
admin-grant tool, writes to `legendary.entitlements` without
importing from `billing/`).

**Rationale.** Mirrors the WP-052 / WP-104 / WP-109 / WP-132
sibling-flat precedent. A future second payment provider lands
under `apps/server/src/billing/<provider>/` (sub-namespace) without
fragmenting the entitlement read path.

**Status:** Active. Flips to Resolved at WP-133 close.

### D-DEC-2 — Migration Slot: `012_create_stripe_events_and_checkout_sessions.sql` [LOCKED AT DRAFT]

**Decision:** Slot 012, single migration creating both tables
idempotently.

**Rationale.** Slot 011 reserved by WP-132. Slot 012 is the next
free per the sequential-non-recyclable convention (D-5202 +
WP-101 + WP-104 + WP-109 + WP-132). Single migration because both
tables are introduced together for the same WP.

**Status:** Active. Flips to Resolved at WP-133 close.

### D-DEC-3 — Stripe SDK Version Pin [DECISION REQUIRED]

**Question.** Which version of the `stripe` Node SDK does WP-133
introduce as a server dependency?

(a) **Exact-pin to currently-stable major (recommended default):**
At execution time, executor runs `pnpm view stripe version` to
fetch the current stable release; pins to that exact version
(e.g., `"stripe": "18.4.0"`). Adds `// why:` to package.json
header documenting the pinning posture.

(b) **Caret-range to latest major:** `"stripe": "^18.0.0"`. Looser;
allows minor-version bumps via `pnpm install` re-runs. Stripe SDKs
have historically been API-stable within a major; the per-call
`apiVersion` parameter is what binds the wire protocol.

(c) **No-pin (latest):** `"stripe": "*"`. Reject — drift risk and
violation of WP-007 / WP-126 dependency-pinning convention.

**Constraints (locked at draft time):**
- The SDK version MUST be a single value, not a range that pulls
  in unreviewed code at build time.
- The `apiVersion` parameter passed to `new Stripe(secretKey, {
  apiVersion })` MUST be pinned in `billing.config.ts` to the
  current Stripe API version at execution time. Stripe API
  versions are date-stamped strings (e.g., `'2025-09-30.acacia'`).
- **The `apiVersion` pin is a security and correctness invariant,
  not just an operational one.** Stripe's webhook event payloads
  are versioned per the API version configured on the account or
  passed at SDK construction; accepting an unpinned version risks
  silent shape drift in event payloads (new fields, removed fields,
  changed enum values) that breaks WP-134's fulfillment parser. A
  shape change WP-134 doesn't expect can result in either: (a)
  granted entitlements for events that should have been rejected,
  or (b) cross-validation failures for valid purchases. Both
  outcomes violate Vision §3 Player Trust & Fairness. Pinning is
  the mechanical defense; the executor MUST treat an
  `apiVersion` bump as a coordinated WP-133 + WP-134 review, not
  a routine dependency update.
- **DECISIONS.md changelog citation requirement.** When the
  executor locks D-13303 at WP-133 close, the entry MUST cite the
  Stripe API version changelog URL (e.g.,
  `https://docs.stripe.com/upgrades` or the version-specific
  release notes) for the locked version. Future WPs that bump
  `apiVersion` cite the same changelog URL for the new version
  and document any breaking shape changes that require WP-134
  parser updates.

**Recommended default:** Option (a) — exact-pin. Rationale:
matches WP-052's `pg` pinning + WP-126's "built-ins-only or
exact-pinned dependency" posture. Caret-range (b) is acceptable
but introduces drift risk on `pnpm install` re-runs across
contributors.

### D-DEC-4 — Raw-Body Middleware Approach [DECISION REQUIRED]

**Question.** How is the raw request body provided to
`stripe.webhooks.constructEvent` for the webhook route?

(a) **Route-level `koa-body` raw mode (recommended default):**
The webhook route is registered with a route-scoped middleware
`koaBody({ rawBody: true, jsonLimit: '1mb' })` that populates
`ctx.request.rawBody`. The global JSON parser is unchanged and
applies to all other routes including
`POST /api/billing/checkout-session`.

(b) **Global JSON parser bypass for `/api/billing/webhook/stripe`:**
The global JSON parser is configured with an explicit path
exclusion; the webhook route receives raw bytes via
`ctx.req.on('data')` event collection. More plumbing; fewer
dependencies (does not require koa-body).

(c) **Separate koa app for the webhook route:** Mount a
sub-application solely for the webhook with no JSON parser.

**Constraints (locked at draft time):**
- `stripe.webhooks.constructEvent(rawBody, sig, secret)` MUST
  receive the bytes-identical raw body. Any JSON parse + restringify
  invalidates the signature; tests assert this.
- The chosen approach MUST NOT affect the other billing route
  (`POST /api/billing/checkout-session`), which receives JSON.
- The chosen approach MUST be reproducible at test time without a
  live HTTP server (tests construct a `ctx`-shaped object).

**Recommended default:** Option (a) — route-level `koa-body`.
Rationale: `koa-body` is already in the dependency tree (boardgame.io
pulls it transitively); route-level scoping is the well-documented
Stripe-recommended approach for Koa; testing is straightforward.
Option (b) is acceptable but introduces hand-rolled byte collection
that is its own correctness risk. Option (c) over-engineers MVP.

### D-DEC-5 — Price Allowlist Source [DECISION REQUIRED]

**Question.** Where does the `priceId → entitlementKey` allowlist
live?

(a) **Single env var `STRIPE_PRICE_ALLOWLIST` (recommended default):**
Comma-separated `priceId:entitlementKey` pairs parsed once at
startup into `ReadonlyMap<string, EntitlementKey>`. Mirrors the
WP-126 env-var-driven config pattern.

(b) **New table `legendary.stripe_price_allowlist`:** DB-backed
allowlist with admin tool for management. Heavier; introduces a
new admin surface.

(c) **JSON file at `apps/server/src/billing/price-allowlist.json`:**
Checked into the repo. Tightly version-controlled.

**Constraints (locked at draft time):**
- Every allowlist entry's `entitlementKey` MUST be a member of
  `ENTITLEMENT_KEYS` (imported from WP-132). Startup parser
  validates and fails loudly on miss.
- The allowlist MUST be loaded once at startup, never read at
  request time, never mutated at runtime.
- Adding a price ID requires a deploy (env var update) at MVP;
  future WP may add admin tooling.

**Recommended default:** Option (a) — env var. Rationale: matches
WP-126 / WP-131 startup-construction pattern; keeps secret-adjacent
configuration in the same surface (Render env vars / `.env`); does
not require new tables; one-deploy-to-update is acceptable at MVP.
Option (b) is right once admin tooling exists (future WP). Option
(c) puts price IDs in source control which is acceptable but couples
deploys to repo updates.

### D-DEC-6 — Webhook Idempotency Key [DECISION REQUIRED]

**Question.** What field on the Stripe event provides the
idempotency key?

(a) **Stripe `event.id` (recommended default):** UNIQUE constraint
on `legendary.stripe_events.event_id`. Stripe's documented
guarantee: `event.id` is unique per event delivery; retries carry
the same `event.id`.

(b) **Stripe `event.id + event.type` composite:** Tighter — defends
against the (impossible per Stripe docs) case of an `event.id`
collision across event types.

(c) **No DB-side idempotency; rely on `processed_at IS NULL` filter
in WP-134:** Skip the UNIQUE constraint. Lighter schema; relies
entirely on WP-134's row-level processing logic.

**Constraints (locked at draft time):**
- The idempotency key MUST guarantee that re-delivery of an event
  by Stripe (which retries on 5xx) writes at most one row in
  `legendary.stripe_events`.
- The chosen key MUST permit WP-134 to read unprocessed events
  via a single SQL `SELECT` over a small index.

**Recommended default:** Option (a) — `event.id` UNIQUE. Rationale:
Stripe documents `event.id` as unique per event; tightening to
composite (b) buys nothing the docs don't already guarantee.
Option (c) pushes idempotency to the WP-134 row-level processor,
which is fine in principle but loses defense-in-depth.

### D-DEC-7 — Subscription Posture [DECISION REQUIRED]

**Question.** Does WP-133 support recurring subscriptions?

(a) **One-time payments only at MVP (recommended default):** Stripe
Checkout `mode: 'payment'`. Vision §784 #1 (Legendary Supporter
recurring subscriptions) is enabled in spirit by the entitlement
substrate but actual recurring billing lands in a future WP.

(b) **One-time + subscription:** Stripe Checkout `mode: 'payment'`
or `mode: 'subscription'` based on price metadata. Webhook handler
records `customer.subscription.*` events alongside
`checkout.session.completed`. Complicates WP-134 fulfillment.

**Constraints (locked at draft time):**
- Whichever path is chosen, the Vision NG-1..NG-7 invariants hold
  by construction (cosmetic-only entitlement keys per WP-132).
- Subscriptions add `customer.subscription.deleted` /
  `invoice.payment_failed` event types to the WP-134 fulfillment
  set; if (a), WP-134 ignores those types.

**Recommended default:** Option (a) — one-time only at MVP.
Rationale: subscriptions add operational complexity (renewal
failure, dunning, prorations, cancel-now-vs-cancel-at-period-end)
that is out of scope for MVP. The `'supporter_tier_basic_2026'`
entitlement key is grantable via a one-time annual purchase
(deterministic, fully-disclosed, no auto-renewal). A future WP
introduces `mode: 'subscription'` after the operational surface is
designed.

### D-DEC-8 — Stripe Customer Creation Strategy [DECISION REQUIRED]

**Question.** When does the server create a Stripe Customer
record for an account?

(a) **Eager-on-checkout (recommended default):** First call to
`POST /api/billing/checkout-session` for an account creates a
Stripe Customer and stores `stripe_customer_id` on the account
(extends `legendary.players` with a new column via the WP-133
migration OR via a separate column on `legendary.stripe_checkout_sessions`).
Subsequent calls reuse the customer.

(b) **Lazy / never:** Pass `customer_email` only; Stripe creates
a guest checkout session each time. Same email may produce multiple
Stripe Customer records. Simpler at MVP; cleanup work later.

(c) **Deferred to future WP:** WP-133 ships without Stripe
Customer creation. The future Customer Portal WP introduces it.

**Constraints (locked at draft time):**
- If (a): the new column MUST be on `legendary.stripe_checkout_sessions`,
  NOT on `legendary.players`. Reason: `legendary.players` is owned
  by WP-052; modifying it requires WP-052-derived clearance.
  Storing `stripe_customer_id` per checkout session is denormalized
  but isolates the Stripe surface from the identity surface.
- If (b): the future WP that introduces Customer Portal MUST
  reconcile orphan Stripe Customers (out of WP-133 scope).

**Recommended default:** Option (c) — defer. Rationale:
Customer Portal is a future WP; eager creation in WP-133 imports
operational complexity for no MVP benefit. The
`POST /api/billing/checkout-session` handler passes
`customer_email` (resolved from the validated `accountId`) and
sets `client_reference_id` for fulfillment correlation. The
future Customer Portal WP introduces eager creation under its
own [DECISION REQUIRED] block.

### D-DEC-9 — `successUrl` / `cancelUrl` Source [DECISION REQUIRED]

**Question.** Where do `successUrl` and `cancelUrl` come from when
WP-133's `createCheckoutSession` constructs a Stripe Checkout
Session?

(a) **Env-derived `PUBLIC_BASE_URL` + fixed paths (recommended
default):** A new env var `PUBLIC_BASE_URL` (e.g.,
`https://app.legendary-arena.com`) is loaded at startup as part of
`BillingConfig`; the route layer constructs
`successUrl = ${PUBLIC_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`
and `cancelUrl = ${PUBLIC_BASE_URL}/billing/cancel`. Both are
server-derived; neither is influenced by request input.

(b) **Fixed server constant:** `successUrl` and `cancelUrl` are
string literals in `billing.config.ts` (`'/billing/success?...'`
relative paths, expanded by Stripe against the dashboard-configured
domain). No env var needed.

(c) **Per-request override allowed (REJECT):** Request body carries
optional `successUrl` / `cancelUrl` fields. **REJECTED at draft
time** because this is a redirect-manipulation vector — see the
billing.logic note above.

**Constraints (locked at draft time):**
- Whichever path is chosen, the URL value MUST NOT be sourced from
  request input under any circumstance. Tests assert the request
  body shape is exactly `{ priceId: string }`.
- If (a): the new env var `PUBLIC_BASE_URL` MUST be added to
  `.env.example` + `render.yaml` in the same commit; the existing
  three Stripe vars become four. The startup guard becomes
  four-var-aware.
- If (b): the relative-path approach depends on Stripe dashboard
  configuration of the production domain; tests document this
  dependency.

**Recommended default:** Option (a) — env-derived. Rationale: makes
the production domain explicit at the server layer, decouples from
Stripe dashboard configuration, and keeps the success-page query
string under server control (e.g., the `session_id` parameter is
populated by Stripe via the literal `{CHECKOUT_SESSION_ID}`
substitution token, not by client input). Option (b) is acceptable
but harder to test (relative paths require mocking Stripe's
domain expansion). Option (c) is rejected.

---

## Acceptance Criteria

### Migration
- [ ] `data/migrations/012_create_stripe_events_and_checkout_sessions.sql` exists and is idempotent
- [ ] `legendary.stripe_events` has 7 columns per Locked contract values
- [ ] `legendary.stripe_checkout_sessions` has 8 columns per Locked contract values
- [ ] UNIQUE constraint on `event_id`; UNIQUE constraint on `session_id`
- [ ] `intent_status` CHECK matches `('open', 'completed', 'expired', 'canceled')` verbatim
- [ ] FK to `legendary.players(account_id)` on `stripe_checkout_sessions`

### Library
- [ ] `billing.config.ts` exports `loadBillingConfig(env)`
- [ ] Production-mode missing-env throws; non-production returns `undefined`
- [ ] `billing.logic.ts` exports `createCheckoutSession` and `recordStripeEvent`
- [ ] `recordStripeEvent` uses `ON CONFLICT (event_id) DO NOTHING`
- [ ] No `INSERT INTO legendary.entitlements` anywhere under `apps/server/src/billing/` (confirmed with `Select-String`)

### Routes
- [ ] `POST /api/billing/checkout-session` validates `priceId` against allowlist BEFORE Stripe call (test asserts via fake stripe client that throws on call)
- [ ] `POST /api/billing/checkout-session` request body shape is exactly `{ priceId: string }`; any extra field (e.g., `successUrl`, `cancelUrl`, `redirectUri`) returns 400 with `code: 'invalid_request'` (verified by a test that posts `{ priceId, successUrl }` and asserts 400)
- [ ] `successUrl` and `cancelUrl` passed to `stripeClient.checkout.sessions.create` are server-derived per D-DEC-9; no path reads them from `req.body`
- [ ] `POST /api/billing/webhook/stripe` verifies signature on raw body via `stripe.webhooks.constructEvent`
- [ ] Webhook returns 400 with `'invalid_signature'` on tampered body
- [ ] Webhook returns 200 with `{ received: true, duplicate: false }` on first delivery
- [ ] Webhook returns 200 with `{ received: true, duplicate: true }` on retry
- [ ] `Cache-Control: no-store` on every response of both routes
- [ ] No `UPDATE legendary.stripe_checkout_sessions SET intent_status` anywhere under `apps/server/src/billing/` (confirmed with `Select-String`) — intent_status transitions are owned by WP-134 per the locked invariant

### Wiring
- [ ] `server.mjs` constructs `billingConfig` once at startup
- [ ] `server.mjs` constructs `stripeClient` once at startup when config available
- [ ] `server.mjs` calls `registerBillingRoutes(...)` with the deps bundle
- [ ] Production-mode missing-env exits 1 with operator-facing diagnostic

### Dependency
- [ ] `apps/server/package.json` adds `stripe` at the exact version per D-DEC-3
- [ ] `pnpm-lock.yaml` reflects the addition
- [ ] `.env.example` and `render.yaml` document the three (or four, if D-DEC-9 = (a)) new env vars
- [ ] D-13303's DECISIONS.md entry cites the Stripe API version changelog URL for the locked `apiVersion` value
- [ ] `loadBillingConfig` returns `Object.freeze`-wrapped `BillingConfig`; runtime mutation of `config.priceAllowlist` requires an explicit TypeScript cast (verified by inspection)

### Catalog
- [ ] Two new `Wired` rows in `docs/ai/REFERENCE/api-endpoints.md`
- [ ] Both rows reference `WP-133` as `Authorizing WP`
- [ ] Auth column matches `authenticated-session-required` (checkout) and `guest` (webhook)

### Tests
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
- [ ] `billing.config.test.ts` covers all 4 paths (prod-missing throws, non-prod-missing returns undefined, valid parses, non-member entitlementKey throws)
- [ ] `billing.logic.test.ts` covers happy + invalid_price + Stripe error + duplicate event
- [ ] `billing.routes.test.ts` covers all status codes in the documented domain

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/server build
# Expected: exits 0

# Step 2 — tests
pnpm --filter @legendary-arena/server test
# Expected: TAP — all passing

# Step 3 — confirm no entitlement INSERT in billing
Select-String -Path "apps\server\src\billing" -Pattern "INSERT INTO legendary\.entitlements" -Recurse
# Expected: no output (WP-134 owns that path)

# Step 3b — confirm no intent_status transition in billing
Select-String -Path "apps\server\src\billing" -Pattern "UPDATE legendary\.stripe_checkout_sessions SET intent_status" -Recurse
# Expected: no output (WP-134 owns intent_status lifecycle)

# Step 4 — confirm Stripe SDK confined to billing
Select-String -Path "apps","packages" -Pattern "from 'stripe'" -Recurse
# Expected: only matches under apps\server\src\billing\

# Step 5 — confirm raw-body middleware on webhook route
Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "rawBody"
# Expected: at least one match in the webhook route registration

# Step 6 — confirm constructEvent signature verification
Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "constructEvent"
# Expected: at least one match

# Step 7 — confirm price allowlist is consulted before Stripe call
Select-String -Path "apps\server\src\billing\billing.logic.ts" -Pattern "priceAllowlist"
# Expected: matches before any sessions.create call (reviewer confirms ordering manually)

# Step 8 — migration idempotency
node --env-file=.env scripts/run-migrations.mjs
node --env-file=.env scripts/run-migrations.mjs
# Expected: second run is a no-op

# Step 9 — confirm catalog rows exist
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "POST.*\/api\/billing"
# Expected: two matches in the Server-Registered Routes table

# Step 10 — scope boundary
git diff --name-only
# Expected: only files in ## Files Expected to Change
```

---

## Definition of Done

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
- [ ] Migration applies idempotently
- [ ] No `INSERT INTO legendary.entitlements` anywhere under `apps/server/src/billing/`
- [ ] No `from 'stripe'` import outside `apps/server/src/billing/`
- [ ] Stripe webhook signature verification confirmed by tampered-body test
- [ ] Production-mode missing-env exit-1 confirmed by startup-guard test
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated per D-11804
- [ ] `docs/ai/STATUS.md` updated — Stripe wiring + event ingestion live; explicitly notes WP-133 ships zero fulfillment path; entitlements remain ungranted until WP-134 lands
- [ ] `docs/ai/DECISIONS.md` updated — D-13301..D-13309
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-133 checked off
- [ ] 01.5 NOT INVOKED
- [ ] 01.6 post-mortem OPTIONAL

---

## Lint Self-Review (00.3)

- §1 Structure — PASS (all required sections present)
- §2 Constraints — PASS (engine-wide + packet-specific + protocol + locked values; full file contents required; references 00.6)
- §3 Assumes — PASS (WP-052 / WP-112 / WP-115 / WP-118 / WP-132 listed; WP-131 noted as ideal-not-required)
- §4 Context — PASS (ARCHITECTURE.md §Layer Boundary + §Persistence; WP-104 / WP-115 / WP-126 / WP-131 / WP-132 precedents; 00.2 §4; 00.6; Vision §765–794; DECISIONS scan)
- §5 Files Expected — PASS (18 files; all marked new/modified; bounded by domain — config + types + logic + routes + tests + migration + wiring + catalog + governance — no abstract output)
- §6 Naming — PASS (`accountId`, `priceId`, `sessionId`, `entitlementKey`, `eventId` per 00.2 conventions)
- §7 Dependencies — PASS (`stripe` SDK exact-pinned per D-DEC-3; no axios/node-fetch/Jest/Mocha/Passport/Auth0/Clerk; package.json + pnpm-lock update required)
- §8 Architectural Boundaries — PASS (server-layer only; no engine import; Stripe SDK confined; layer-boundary clarified)
- §9 Windows — PASS (PowerShell `Select-String`; `\` separators)
- §10 Env vars — PASS (three new vars documented; .env.example + render.yaml updated; no secrets in repo; secret values via Render dashboard per WP-126 precedent)
- §11 Authentication — PASS (caller-injected `requireAuthenticatedSession` for checkout; Stripe-signature for webhook; both posture choices identified explicitly)
- §12 Test quality — PASS (`node:test` only; no boardgame.io import; tests stub the Stripe client — no live network)
- §13 Verification — PASS (pnpm only; exact `Select-String` patterns; expected outputs inline)
- §14 Acceptance criteria — PASS (binary, observable, ~30 items grouped by sub-task)
- §15 Definition of Done — PASS (acceptance + build + test + STATUS + DECISIONS + WORK_INDEX + scope-boundary)
- §16 Code style — PASS (no premature abstraction; explicit control flow; full English names; functions ≤30 lines; full-sentence error messages)
- §17 Vision Alignment — PASS (clauses §3 / §11 / §14 / §15 / §765–794 / NG-1..NG-7 cited by ID; no-conflict assertion; non-goal proximity check; determinism N/A with rationale)
- §18 Prose-vs-grep — PASS (`Select-String` patterns are scoped to specific files / directories; the prose discussion of forbidden-INSERT-INTO-legendary.entitlements cites WP-134 as the legitimate path rather than enumerating tokens that the grep would false-positive on)
- §19 Bridge-vs-HEAD — N/A at draft
- §20 Funding Surface Gate — PASS via N/A path (justification: paid-tier Stripe purchase plumbing, not tournament-funding donation surface; no §20.1 trigger surfaces touched; cites Vision §765–794 stream-#2 distinction)
- §21 API Catalog — PASS (two new `Wired` rows; closed-set Auth values; `Authorizing WP: WP-133`; canonical field names match 00.2)
