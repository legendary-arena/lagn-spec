# EC-136 — Stripe Checkout Session Creation & Webhook Ingestion (Execution Checklist)

**Source:** docs/ai/work-packets/WP-133-stripe-checkout-session-and-webhook-ingestion.md
**Layer:** Server (`apps/server/src/billing/**` new + `apps/server/src/server.mjs` wiring) + Schema (`data/migrations/012`) + Reference (`docs/ai/REFERENCE/api-endpoints.md` per D-11804 + `docs/ai/REFERENCE/00.2-data-requirements.md §4 Table Inventory`)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-133.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-133.

---

## §0 — Pre-Flight

- [ ] WP-052 complete: `identity.types.ts` exports `AccountId` (branded `string`), `Result<T>`, `DatabaseClient`, `PlayerAccount`. `legendary.players` columns include `player_id bigserial PRIMARY KEY` and `ext_id text NOT NULL UNIQUE`. **There is NO `account_id` column on `legendary.players`** — see §Common Failure Smells #FK-BUG.
- [ ] WP-112 complete: `requireAuthenticatedSession(req, options): Promise<Result<AccountId>>` exported from `apps/server/src/auth/sessionToken.logic.ts`; `SessionVerifier` + `AccountResolver` types exported from `sessionToken.types.ts`.
- [ ] WP-115 complete: long-lived `pg.Pool` constructed once in `startServer()`, threaded into `register*Routes(...)` registration helpers.
- [ ] WP-118 complete: `docs/ai/REFERENCE/api-endpoints.md` exists with closed-set `Status`/`Auth` headers; D-11804 replace-whole-row update obligation locked.
- [ ] WP-132 complete: `apps/server/src/entitlements/entitlements.types.ts` exports `EntitlementKey` closed union + `ENTITLEMENT_KEYS` canonical array; `legendary.entitlements` table exists (migration `011` applied).
- [ ] WP-131 status known: if Done, `POST /api/billing/checkout-session` is genuinely authenticated at WP-133 close. If not Done, the checkout-session route returns 500 `'session_verifier_not_configured'` on auth-path calls (fail-closed per D-11204). The webhook route (`guest`) is unaffected either way.
- [ ] `apps/server/src/billing/` does NOT yet exist.
- [ ] `data/migrations/012_*.sql` does NOT yet exist (slot free; sequential-non-recyclable per D-5202 / WP-101 / WP-104 / WP-132 precedent).
- [ ] **Resolve #FK-BUG before writing any migration code.** WP-133 §Locked contract values specify `REFERENCES legendary.players(account_id)` for `stripe_checkout_sessions.account_id`. That column does not exist on `legendary.players`. The correct FK target is `REFERENCES legendary.players(ext_id)` (preserving the `account_id text` column name on `stripe_checkout_sessions`) — or adopt the `player_id bigint REFERENCES legendary.players(player_id)` pattern used by WP-104 / WP-109 / WP-132. Lock the chosen fix in D-13302's DECISIONS.md entry before coding the migration.
- [ ] Nine executor decisions locked in writing **before coding**: **D-13301** (module path — LOCKED at draft = `apps/server/src/billing/`), **D-13302** (migration slot — LOCKED at draft = `012_create_stripe_events_and_checkout_sessions.sql`), **D-13303** (Stripe SDK version: run `pnpm view stripe version`; pin exact version; also pin `apiVersion` date-stamped string and record changelog URL), **D-13304** (raw-body middleware: recommended = route-level `koa-body` raw mode, `jsonLimit: '1mb'`), **D-13305** (price allowlist source: recommended = `STRIPE_PRICE_ALLOWLIST` env var), **D-13306** (webhook idempotency key: recommended = `event_id` UNIQUE), **D-13307** (subscription posture: recommended = one-time `mode: 'payment'` only), **D-13308** (Stripe Customer creation: recommended = defer to future WP), **D-13309** (`successUrl`/`cancelUrl` source: recommended = env-derived `PUBLIC_BASE_URL`).
- [ ] `pnpm --filter @legendary-arena/server build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0 on `main` HEAD. Reconcile suite/test counts if WP-131 / WP-132 baseline shifted between EC draft and execution.
- [ ] `docs/ai/REFERENCE/00.2-data-requirements.md §4 Table Inventory` does not yet carry rows for `legendary.stripe_events` or `legendary.stripe_checkout_sessions`; both added in same commit.

## §1 — Scope Lock + File Allowlist

Eighteen production/reference files may change plus governance ledgers in the same commit.

- `data/migrations/012_create_stripe_events_and_checkout_sessions.sql` — **new** — two tables + two indexes (idempotent)
- `apps/server/src/billing/billing.types.ts` — **new** — type contracts
- `apps/server/src/billing/billing.config.ts` — **new** — `loadBillingConfig(env)` + allowlist parser
- `apps/server/src/billing/billing.config.test.ts` — **new** — four config branches
- `apps/server/src/billing/billing.logic.ts` — **new** — `createCheckoutSession` + `recordStripeEvent`
- `apps/server/src/billing/billing.logic.test.ts` — **new** — happy + invalid_price + stripe error + duplicate event
- `apps/server/src/billing/billing.routes.ts` — **new** — `registerBillingRoutes` + both HTTP handlers
- `apps/server/src/billing/billing.routes.test.ts` — **new** — all status-code paths for both routes
- `apps/server/src/server.mjs` — **modified** — env load + Stripe client construct + `registerBillingRoutes` call
- `apps/server/package.json` — **modified** — add `stripe` at exact version per D-13303
- `pnpm-lock.yaml` — **modified** — `pnpm install` regenerates
- `.env.example` — **modified** — three (or four if D-13309 = (a)) new vars with placeholders
- `render.yaml` — **modified** — same new vars, `sync: false`
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — two new `Wired` rows
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **modified** — two new table rows in §4
- `docs/ai/STATUS.md` — **modified** — append WP-133 close entry
- `docs/ai/DECISIONS.md` — **modified** — D-13301..D-13309
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-133
- Plus governance: `EC_INDEX.md`

`git diff --name-only` lists exactly 18 files at session close (19 if `EC_INDEX.md` or `PUBLIC_BASE_URL` adds a distinct line to render.yaml).

## §2 — Locked Values (do not re-derive)

- **`legendary.stripe_events` columns (7, verbatim from WP):** `id bigserial PK`, `event_id text NOT NULL UNIQUE`, `event_type text NOT NULL`, `payload jsonb NOT NULL`, `received_at timestamptz NOT NULL DEFAULT now()`, `processed_at timestamptz NULL`, `process_error text NULL`.
- **`stripe_events.payload` contract:** full Stripe event object returned by `stripe.webhooks.constructEvent(rawBody, sig, secret)`, serialized via `JSON.stringify(event)`. Full envelope preserved (`id`, `object`, `api_version`, `type`, `data.object`, `data.previous_attributes`, `livemode`, `pending_webhooks`, `request`). Never store `event.data.object` alone — `api_version` in the outer envelope is the forensic signal for Stripe-side API version drift; WP-134 reads `payload.data.object.payment_status`, `.client_reference_id`, `.metadata`, and `.id`.
- **`legendary.stripe_checkout_sessions` columns (8, verbatim from WP — ⚠ FK target corrected per §0 #FK-BUG):** `id bigserial PK`, `session_id text NOT NULL UNIQUE`, `account_id text NOT NULL REFERENCES legendary.players(ext_id) ON DELETE CASCADE` *(corrected from the WP draft which said `legendary.players(account_id)` — `legendary.players` has no `account_id` column; `ext_id text` is the UNIQUE alternate key; executor documents chosen fix in D-13302)*, `price_id text NOT NULL`, `entitlement_key text NOT NULL`, `intent_status text NOT NULL CHECK (intent_status IN ('open', 'completed', 'expired', 'canceled'))`, `created_at timestamptz NOT NULL DEFAULT now()`, `completed_at timestamptz NULL`.
- **`intent_status` posture:** WP-133 INSERTs `'open'` only. Zero `UPDATE` or `SET intent_status` anywhere in this WP. All transitions and all writes to `completed_at` owned by WP-134.
- **`stripe_events` idempotency:** `INSERT INTO legendary.stripe_events (...) ON CONFLICT (event_id) DO NOTHING`. Single-writer gate — WP-133 is the only WP that INSERTs into this table.
- **`process_error` ownership:** `process_error` is always `NULL` in every WP-133 INSERT — the column is introduced by WP-133's migration but WP-133 never writes a non-NULL value. WP-134's fulfillment processor is the sole writer; any non-NULL in WP-133 code is a scope violation.
- **HTTP routes:** `POST /api/billing/checkout-session` (`authenticated-session-required`); `POST /api/billing/webhook/stripe` (`guest`).
- **Status-code domains (closed sets):** checkout-session `{200, 400, 401, 500, 503}`; webhook `{200, 400, 500}`.
- **Response error envelope split:** auth/config faults → `{ code: '<BillingErrorCode>' }`; operational faults → `{ error: 'internal_error' }`. Never mix envelopes.
- **`BillingErrorCode` closed union (verbatim):** `'unauthorized' | 'session_verifier_not_configured' | 'invalid_price' | 'invalid_request' | 'stripe_error' | 'invalid_signature' | 'billing_not_configured' | 'internal_error'`.
- **Module path:** `apps/server/src/billing/` (D-13301 LOCKED).
- **Migration slot:** `012_create_stripe_events_and_checkout_sessions.sql` (D-13302 LOCKED).
- **New env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ALLOWLIST`. Format: comma-separated `priceId:entitlementKey` pairs (e.g., `price_1ABC...:supporter_tier_basic_2026,price_1DEF...:cosmetic_playmat_comic`). Parser validates every `entitlementKey` ∈ `ENTITLEMENT_KEYS`; startup fails loudly on parse error.
- **`apiVersion` pin:** exact Stripe API date-stamped string (e.g., `'2025-09-30.acacia'`) locked at execution time. D-13303 DECISIONS.md entry MUST cite the Stripe API version changelog URL (`https://docs.stripe.com/upgrades`).
- **Checkout session request body shape:** exactly `{ priceId: string }` — no other field accepted; extra fields (including `successUrl`, `cancelUrl`, `redirectUri`) return 400 `'invalid_request'`.
- **`successUrl`/`cancelUrl`:** server-derived only per D-13309 (recommended = env-derived `PUBLIC_BASE_URL`). NEVER sourced from request input.
- **`Cache-Control: no-store`** is the FIRST statement of every handler body on all response paths, before any branching — mirrors WP-115 D-11504.
- **`BillingConfig` wrapper:** `Object.freeze(...)` applied before return from `loadBillingConfig`; `ReadonlyMap<string, EntitlementKey>` typing prevents `.set()` calls at compile time.
- **Webhook handler scope:** ONLY: signature verification + single INSERT (`ON CONFLICT DO NOTHING`) + return 200. No Stripe API calls, no fulfillment logic, no background tasks, no external I/O inside the handler.
- **Catalog rows (D-11804 replace-whole-row):** two new `Wired` rows; `Auth` = `authenticated-session-required` (checkout) and `guest` (webhook); `Authorizing WP` = `WP-133`. WP-134 replaces the webhook row in full at WP-134 close per D-11804.
- **No new npm dependencies beyond `stripe` SDK.** Exact version per D-13303.

## §3 — Guardrails

- **No entitlement INSERT.** Zero `INSERT INTO legendary.entitlements` or any SQL targeting that table anywhere under `apps/server/src/billing/`. §5 grep gate enforces. WP-134 is the sole INSERT site.
- **No `intent_status` transitions.** Zero `UPDATE legendary.stripe_checkout_sessions SET intent_status` anywhere under `apps/server/src/billing/`. §5 grep gate enforces. WP-134 owns all transitions.
- **All events ingested without type-filtering.** No `event.type` filter inside the webhook ingestion handler. WP-133 records every verified event; WP-134 is the sole classifier. Adding an `event.type` conditional here drops events WP-134 may need.
- **Allowlist-before-Stripe.** `priceId` validated against allowlist BEFORE any `stripeClient.*` call. Test uses a fake Stripe client that throws if invoked; invalid `priceId` MUST NOT reach the SDK.
- **Raw-body middleware first.** Webhook route registers raw-body mode BEFORE the global JSON parser fires. JSON parse + restringify invalidates the HMAC signature; `constructEvent` would throw on re-stringified bytes. Route-scoped per D-13304.
- **Server-derived URLs only.** No code path reads `successUrl`/`cancelUrl` from `req.body`, `req.query`, or `req.params`. Extra request fields return 400 `'invalid_request'`; test asserts by posting `{ priceId, successUrl }` and expecting 400.
- **Stripe SDK confined.** `from 'stripe'` MUST NOT appear outside `apps/server/src/billing/`. §5 grep gate enforces across all of `apps/` and `packages/`.
- **Production-fatal guard.** `loadBillingConfig` in production throws on any missing env var; `server.mjs` catches and exits 1. Mirrors WP-126 / WP-131 startup guard.
- **Layer Boundary.** No file under `apps/server/src/billing/` imports `boardgame.io`, `@legendary-arena/(game-engine|registry|preplan)`, or any `apps/(arena-client|registry-viewer|replay-producer)` symbol. §5 grep gate enforces.
- **Webhook fast-return.** Handler contains exactly: raw-body parse + signature verification + single INSERT + return 200. Zero synchronous Stripe API calls or blocking external I/O after signature check.

## §4 — Required `// why:` Comments

- `data/migrations/012_*.sql` above the `stripe_events_unprocessed_idx` partial index: cite WP-134 reads unprocessed events via `WHERE processed_at IS NULL`; partial index scopes reads to the working set only.
- `data/migrations/012_*.sql` above `intent_status CHECK`: cite closed set; WP-133 inserts `'open'` only; all transitions owned by WP-134 by architectural lock — a future engineer adding transitions here would be wrong.
- `data/migrations/012_*.sql` above `entitlement_key text NOT NULL` on `stripe_checkout_sessions`: cite denormalized to avoid an extra JOIN in WP-134's fulfillment query (fulfillment identifies which entitlement to grant without a second lookup).
- `data/migrations/012_*.sql` above the `session_id` UNIQUE constraint: cite Stripe Checkout Session IDs are globally unique; enforcing UNIQUE guarantees idempotency if a future retry or duplicate creation path occurs.
- `billing.config.ts` on `Object.freeze(...)`: cite pricing policy changes only via deploy + DECISIONS.md entry; freeze prevents mid-request reassignment of config wrapper properties; `ReadonlyMap` typing catches accidental `.set()` calls at compile time.
- `billing.config.ts` on the production-mode-fatal branch: cite WP-126 / WP-131 startup-guard precedent; name the three (or four) required env vars.
- `billing.logic.ts` above `priceAllowlist` check: cite gate fires BEFORE any Stripe SDK call; miss returns early; a client submitting an arbitrary price ID gets 400 with no Stripe call made.
- `billing.logic.ts` above `successUrl`/`cancelUrl` server-derivation: cite redirect-manipulation attack — an attacker who controls `successUrl` can redirect authenticated users post-payment to a phishing page that appears to confirm a successful purchase.
- `billing.routes.ts` on webhook raw-body middleware: cite D-13304 (route-level scope); cite `stripe.webhooks.constructEvent` requires bytes-identical raw body; JSON parse + restringify step invalidates the HMAC signature; cite 1mb `jsonLimit` prevents oversized payload abuse while remaining above current Stripe event sizes.
- `billing.routes.ts` above the all-events ingestion path (no `event.type` filter): cite WP-133 is ingestion-only; filtering is WP-134's responsibility; dropping events prematurely here would make replay impossible for event types WP-134 may need later.
- `server.mjs` above `registerBillingRoutes(...)`: cite deps bundle mirrors WP-131 `registerEntitlementRoutes` shape; `billingConfig` and `stripeClient` constructed once at startup per WP-126 pattern; `stripeClient` is `undefined` when `billingConfig` is `undefined` (non-production missing-env path).

## §5 — Verification Gates (run all; every item binary)

- [ ] `pnpm --filter @legendary-arena/server build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0. Engine baseline UNCHANGED (engine never touched; 01.5 NOT INVOKED — server-layer-only WP).
- [ ] **No entitlement INSERT.** `Select-String -Path "apps\server\src\billing" -Pattern "INSERT INTO legendary\.entitlements" -Recurse` returns no output.
- [ ] **No `intent_status` transition.** `Select-String -Path "apps\server\src\billing" -Pattern "UPDATE legendary\.stripe_checkout_sessions SET intent_status" -Recurse` returns no output.
- [ ] **No `event.type` filter in webhook handler.** `Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "event\.type\s*[!=]"` returns no output. WP-133 ingests all verified events; WP-134 is the classifier.
- [ ] **Stripe SDK confined.** `Select-String -Path "apps","packages" -Pattern "from 'stripe'" -Recurse` returns matches only under `apps\server\src\billing\`. Zero matches elsewhere.
- [ ] **Raw-body middleware on webhook route.** `Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "rawBody"` returns at least one match inside the webhook route registration block.
- [ ] **`constructEvent` call present.** `Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "constructEvent"` returns at least one match.
- [ ] **Allowlist consulted before Stripe call.** `Select-String -Path "apps\server\src\billing\billing.logic.ts" -Pattern "priceAllowlist"` returns at least one match; reviewer confirms ordering in source (allowlist check precedes any `sessions.create` invocation).
- [ ] **`ON CONFLICT` idempotency clause present.** `Select-String -Path "apps\server\src\billing\billing.logic.ts" -Pattern "ON CONFLICT"` returns exactly one match (the `stripe_events` INSERT).
- [ ] **Request body shape — no redirect fields in request-parsing paths.** `Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "req\.body\.successUrl|req\.body\.cancelUrl|req\.body\.redirectUri"` returns no output. (Reviewer confirms zero matches in any `req.body.*` access for these fields.)
- [ ] **`Cache-Control: no-store` first-statement on both routes.** Manual review confirms header is set as first statement in both handler bodies, before branching. `Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "Cache-Control"` returns at least two matches (one per handler).
- [ ] **No `boardgame.io` import.** `Select-String -Path "apps\server\src\billing" -Pattern "from .['\"]boardgame\.io" -Recurse` returns no output.
- [ ] **No engine / registry / preplan import.** `Select-String -Path "apps\server\src\billing" -Pattern "@legendary-arena/(game-engine|registry|preplan)" -Recurse` returns no output.
- [ ] **`Object.freeze` present.** `Select-String -Path "apps\server\src\billing\billing.config.ts" -Pattern "Object\.freeze"` returns at least one match.
- [ ] **Status-code domain — checkout-session.** `Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "status\s*[=:]\s*[0-9]{3}"` returns only `200`, `400`, `401`, `500`, `503` for the checkout-session handler. No `403`, `404`, `422`, etc.
- [ ] **Status-code domain — webhook.** Same grep on webhook handler returns only `200`, `400`, `500`.
- [ ] **`apiVersion` pinned (not `'latest'` or absent).** `Select-String -Path "apps\server\src\billing\billing.config.ts","apps\server\src\server.mjs" -Pattern "apiVersion"` returns at least one match; reviewer confirms value is a date-stamped string (e.g., `'2025-09-30.acacia'`), never `'latest'`.
- [ ] **Migration idempotency.** `node --env-file=.env scripts/run-migrations.mjs` applied twice; second run is a no-op.
- [ ] **Catalog rows landed (D-11804).** `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "POST.*\/api\/billing"` returns exactly two matches in `### Server-Registered Routes`. Both rows carry `Authorizing WP: WP-133`.
- [ ] **`00.2 §4` rows added.** `Select-String -Path "docs\ai\REFERENCE\00.2-data-requirements.md" -Pattern "legendary\.(stripe_events|stripe_checkout_sessions)"` returns at least two matches.
- [ ] **D-DEC codes absent from shipped artifacts.** `Select-String -Path "apps\server\src\billing","data\migrations\012_create_stripe_events_and_checkout_sessions.sql","docs\ai\REFERENCE\api-endpoints.md","docs\ai\REFERENCE\00.2-data-requirements.md" -Pattern "D-DEC-[1-9]" -Recurse` returns no output. Only `D-133NN` numbers appear in shipped artifacts (per EC-128 / EC-135 lock).
- [ ] **Scope boundary.** `git diff --name-only` lists exactly the files in §1.

## §6 — Commit Hygiene

- [ ] Commit prefix: `EC-136:` on the code commit (per `01.3-commit-hygiene-under-ec-mode.md` Rule 5; `WP-133:` is forbidden); `SPEC:` on the governance close commit if two-commit topology used.
- [ ] Vision trailer: `Vision: §3, §11, §14, §15, §765-794, NG-1, NG-2, NG-3, NG-4, NG-5, NG-6, NG-7` per `01.3` Vision Trailer convention.
- [ ] D-11804 catalog obligation lands in same commit: two new `Wired` rows; `Auth` column values per D-9905 closed set; field names match `00.2-data-requirements.md` byte-for-byte.
- [ ] No `--no-verify`, no `--no-gpg-sign` per `01.3` "Bypassing Hooks".

## §7 — Post-Execution Checks

- [ ] All WP-133 §Acceptance Criteria pass.
- [ ] D-13301 + D-13302 written verbatim into `DECISIONS.md` from WP-133 §Decision Points (locked at draft). D-13302 documents the FK correction choice (either `REFERENCES legendary.players(ext_id)` or the `player_id bigint` pattern) with rationale.
- [ ] D-13303 through D-13309 written with executor's locked choices + rationale + rejected alternatives. D-13303 MUST cite the Stripe API version changelog URL (`https://docs.stripe.com/upgrades`) for the locked `apiVersion` value.
- [ ] `STATUS.md` `### WP-133 / EC-136 Executed` block at top of `## Current State` cites: `apps/server/src/billing/` quintet + migration + both HTTP endpoints + `registerBillingRoutes` wiring + catalog rows + each D-133NN locked option + explicit "ZERO fulfillment path; WP-134 owns the entitlement INSERT site" lock.
- [ ] `WORK_INDEX.md` WP-133 row checked off with date + commit hash.
- [ ] `EC_INDEX.md` EC-136 row flipped `Draft` → `Done {YYYY-MM-DD}` with commit hash.
- [ ] 01.5 NOT INVOKED (per WP-133 zero-engine-touch declaration — engine baseline UNCHANGED).
- [ ] 01.6 post-mortem OPTIONAL per server-layer-only WP precedent. Author IFF execution surfaces a design tension worth capturing (e.g., a non-trivial variant of the FK correction; a D-DEC-N option held with contradiction; the raw-body middleware approach deviating from recommended default).

## Common Failure Smells

- **⚠ #FK-BUG (Hard Stop — migration fails at apply time).** WP-133 §Locked contract values specify `REFERENCES legendary.players(account_id)` for `stripe_checkout_sessions.account_id`. `legendary.players` has **no `account_id` column** (per WP-052 D-5201 + EC-135 §2 + the EC-135 execution note confirming the same bug was corrected for WP-132 before execution). Fix before writing migration code: use `REFERENCES legendary.players(ext_id)` (preserving the `account_id text` column name on `stripe_checkout_sessions`, FK on the UNIQUE text alternate key) or adopt the `player_id bigint REFERENCES legendary.players(player_id)` pattern used by WP-104 / WP-109 / WP-132. Document the chosen fix in D-13302.
- Entitlement INSERT (`INSERT INTO legendary.entitlements`) anywhere under `apps/server/src/billing/` → WP-134 scope creep; WP-133 authorship split violated. Remove it.
- `UPDATE legendary.stripe_checkout_sessions SET intent_status` in billing code → `intent_status` lifecycle ownership violated; WP-133 introduces the column for WP-134's use. Remove it.
- `event.type` filter inside the webhook handler (e.g., `if (event.type !== 'checkout.session.completed') return`) → premature filtering drops events WP-134 may need. Remove the filter; record all verified events.
- `successUrl` or `cancelUrl` accepted from `req.body` / `req.query` → redirect-manipulation vector. Both values MUST be server-derived per D-13309.
- JSON parser applied before raw-body middleware on the webhook route → `stripe.webhooks.constructEvent` fails with signature mismatch; the JSON-parsed body has been re-stringified and the byte stream differs. Fix: raw-body registration MUST precede global JSON parser for this route (route-level scope per D-13304).
- Stripe SDK imported anywhere outside `apps/server/src/billing/` → Layer Boundary violation. All `from 'stripe'` references must stay inside the billing directory.
- `apiVersion: 'latest'` or `apiVersion` omitted from `new Stripe(...)` → Stripe-side API shape drift breaks WP-134's fulfillment parser at the next Stripe API version release. Pin to exact date-stamped string; cite changelog URL in D-13303.
- Webhook handler performs a synchronous Stripe API call inside the handler (e.g., `stripeClient.paymentIntents.retrieve(...)`) → fast-return invariant violated; Stripe retries on slow responses. Any enrichment belongs in WP-134's fulfillment processor.
- `billing.config.test.ts` covers only the happy path → the four required branches (production-missing-env throws; non-production-missing-env returns undefined; valid env parses; non-member `entitlementKey` throws) are acceptance criteria; missing any is a failed execution.
- D-DEC decision codes (`D-DEC-1` through `D-DEC-9`) appear in shipped production code, test files, migration, or catalog rows → draft-time placeholders leaked into shipped artifacts (per EC-128 / EC-135 lock). Replace all with executed `D-133NN` numbers.
