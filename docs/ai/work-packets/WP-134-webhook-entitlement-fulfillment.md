# WP-134 — Webhook → Entitlement Fulfillment Processor

**Status:** Draft (drafted 2026-05-03; lint-gate self-review **PASS** — see §Lint Self-Review at foot)
**Primary Layer:** Server (`apps/server/src/billing/**` extension; `scripts/process-stripe-events.mjs` for recovery)
**Dependencies:** WP-052 (`AccountId` + `Result<T>` + `DatabaseClient`); WP-115 (`pg.Pool` lifecycle); WP-118 (catalog + D-11804); **WP-132 (`legendary.entitlements` table + `EntitlementKey` closed union — WP-134 is the WP that adds the INSERT site WP-132 deliberately deferred)**; **WP-133 (`legendary.stripe_events` + `legendary.stripe_checkout_sessions` tables + `billing.config.ts` + `BillingConfig.priceAllowlist` + Stripe SDK + webhook ingestion route)**.

**Slot note:** WP-132 reserves EC-135 + migration slot 011; WP-133 reserves EC-136 + migration slot 012. WP-134 + EC-137 is the next free pair. WP-134 introduces NO new migration (it consumes the schema WP-132 and WP-133 introduce).

---

## Session Context

WP-132 (executed at WP-132 close) shipped `legendary.entitlements` and
the `EntitlementKey` closed union, with zero INSERT site by design.
WP-133 (executed at WP-133 close) shipped `legendary.stripe_events`,
`legendary.stripe_checkout_sessions`, the `BillingConfig.priceAllowlist`
(`Map<priceId, EntitlementKey>`), and the webhook ingestion route that
records events without acting on them. The webhook handler currently
returns 200 within ~tens of milliseconds: `recordStripeEvent` INSERTs
the row and the handler returns. No `legendary.entitlements` row has
ever been created.

This packet adds **the fulfillment processor** — the single code path
that reads unprocessed `legendary.stripe_events` rows and grants
entitlements. WP-134 ships:

- A new helper `processStripeEvent({ eventRecord, billingConfig,
  database }): Promise<FulfillmentResult>` in `apps/server/src/billing/`
  that:
  1. Filters by `event_type === 'checkout.session.completed'` and
     the inner `payload.data.object.payment_status === 'paid'` (other
     event types / unpaid statuses are valid no-ops; the row is
     marked `processed_at = now()` with `process_error = NULL`).
  2. Resolves `accountId` from the event's
     `payload.data.object.client_reference_id` (set by WP-133 at
     session creation) AND cross-validates against
     `legendary.stripe_checkout_sessions.account_id` (defense-in-depth
     — both must agree).
  3. Resolves the `EntitlementKey` from the **server-recorded session
     row**, NOT from the event payload: SELECT
     `legendary.stripe_checkout_sessions.price_id` and
     `entitlement_key` for the row keyed by the event's session ID,
     then look up `priceAllowlist.get(price_id)` to confirm it
     resolves to the same `EntitlementKey` the session row carries
     (denormalized at WP-133 INSERT time). The event's
     `payload.data.object.metadata.entitlementKey` is treated as a
     **consistency check only** — must equal both other sources, but
     is never the primary truth. The processor MUST NOT rely on
     `payload.line_items` (Stripe omits line items from
     `checkout.session.completed` events unless explicitly expanded
     via an extra Stripe API call, which D-DEC-1 forbids in the
     processing path).
  4. INSERTs a row into `legendary.entitlements` with
     `source = 'stripe'`, `source_ref = <stripe_session_id>`,
     `account_id = <resolved>`, `entitlement_key = <resolved>` —
     using `ON CONFLICT (account_id, entitlement_key) WHERE
     revoked_at IS NULL DO NOTHING` (idempotent against retry).
  5. UPDATEs `legendary.stripe_checkout_sessions` setting
     `intent_status = 'completed'` and `completed_at = now()` for
     successful fulfillment (idempotent — a re-run hits the same
     `'completed'` row and is a no-op via the WHERE clause).
  6. UPDATEs `legendary.stripe_events` setting `processed_at = now()`,
     `process_error = NULL` **only on terminal success or
     intentional no-op** (`'fulfilled'`, `'duplicate'`,
     `'unhandled_event_type'`, `'unpaid_session'`, `'already_processed'`).
     **On any failure, the processor sets `process_error = <full-sentence
     message>` and leaves `processed_at = NULL`** so the recovery
     script's `WHERE processed_at IS NULL` filter continues to
     surface the row for retry. See §Non-Negotiable Constraints
     "processed_at lifecycle" for the full locked semantic.

  Steps 4 → 5 → 6 execute in that order. Step 6 is the **last**
  write on the success / no-op path so that a process crash between
  step 4 and step 6 leaves the event re-pickable by the recovery
  script (entitlement INSERT is idempotent; sessions UPDATE is
  idempotent; stripe_events UPDATE not having run means the event
  is still `processed_at IS NULL`, which is correct — the row will
  be retried). Steps 4–6 SHOULD wrap in a `BEGIN; ... COMMIT;`
  transaction (matches the WP-104 `PUT /api/me/links` multi-statement
  transaction precedent); if `DatabaseClient` does not expose a
  transaction primitive, the deterministic ordering above plus
  idempotency satisfies correctness.
- A modification to WP-133's webhook handler at
  `apps/server/src/billing/billing.routes.ts` that calls
  `processStripeEvent` synchronously after `recordStripeEvent` INSERT
  but before returning 200 to Stripe. Per D-DEC-1, processing is
  synchronous-on-webhook at MVP scale — fulfillment errors do not
  surface to the Stripe response (still 200 with `{ received: true,
  duplicate: <bool>, processed: <bool>, reason: <closed-set string |
  null> }`) so Stripe does not retry on processing failure (the
  recorded event remains queryable by the recovery script via
  `WHERE processed_at IS NULL`). On **duplicate delivery**
  (`recordStripeEvent` returns `inserted: false`), the handler loads
  the existing event row by `event_id` and inspects its
  `processed_at`: if NULL, the handler attempts `processStripeEvent`
  inline (the duplicate is a self-heal opportunity); if non-NULL,
  the handler skips processing and returns
  `{ received: true, duplicate: true, processed: false, reason:
  null }`. This keeps the "record first" invariant while letting
  duplicates rescue events whose first delivery failed processing.
- A new recovery script `scripts/process-stripe-events.mjs` that runs
  outside the request path. It reads
  `legendary.stripe_events WHERE processed_at IS NULL ORDER BY
  received_at ASC LIMIT 100`, calls `processStripeEvent` per row,
  exits 0 with a one-line summary (`processed: 5, skipped: 12,
  errors: 0`).
- A new `apps/server/src/billing/processStripeEvent.logic.ts` (new
  file rather than extending `billing.logic.ts` so the fulfillment
  surface is greppable as its own module) plus
  `processStripeEvent.logic.test.ts`.

WP-134 is the **only** WP in the chain that mutates
`legendary.entitlements`. After WP-134 closes, the full path is live:
user clicks "Upgrade" (future arena-client WP) → server creates
Checkout Session (WP-133) → user pays at Stripe-hosted Checkout →
Stripe sends `checkout.session.completed` webhook (WP-133 ingests +
WP-134 fulfills inline) → entitlement row created → next call to
`GET /api/me/entitlements` (WP-132) returns the new row.

**Scope deliberately excluded from this packet:**
- Refunds / reversals — out of scope; future WP that handles
  `charge.refunded` and writes `revoked_at` on entitlement rows.
- Subscription lifecycle (`customer.subscription.deleted`,
  `invoice.payment_failed`) — out of scope per WP-133 D-DEC-7
  (subscriptions deferred).
- Admin grant tool (writes `source = 'admin_grant'`) — out of scope.
- Failure-retry queue / dead-letter — out of scope; recovery script
  handles backlog.
- Profile-page UI showing "Your benefits" — out of scope; future
  arena-client WP consumes WP-132's read endpoint.
- Email notifications — out of scope; Stripe-hosted Checkout's
  built-in email covers receipts.

---

## Goal

After this session, a `checkout.session.completed` webhook with
`payment_status === 'paid'` produces exactly one row in
`legendary.entitlements`:

- A new helper `processStripeEvent` lives at
  `apps/server/src/billing/processStripeEvent.logic.ts`. Pure
  function given `(eventRecord, billingConfig, database)`. Returns
  `FulfillmentResult = Result<FulfillmentSuccess>` matching WP-052's
  locked `Result<T>` shape — see §Locked contract values for the
  full type, the `FulfillmentSuccessReason` closed union, and the
  `FulfillmentErrorCode` closed union.
- WP-133's webhook handler is modified to call `processStripeEvent`
  synchronously after `recordStripeEvent` and before returning 200.
  The response shape extends to `{ received: true; duplicate:
  boolean; processed: boolean; reason: string | null }`.
- A new script at `scripts/process-stripe-events.mjs` reads
  unprocessed events from `legendary.stripe_events`, calls
  `processStripeEvent` per row, exits 0 with a summary.
- WP-134 introduces **no new migration**. It consumes the schema
  WP-132 + WP-133 already shipped.
- WP-134 introduces **no new HTTP endpoint**. The webhook route
  shape already exists; WP-134 modifies its handler body.
- The catalog row for `POST /api/billing/webhook/stripe` is
  updated **per D-11804 replace-whole-row semantics**: response
  schema gains the `processed` and `reason` fields; the row's
  `Authorizing WP` column becomes `WP-133, WP-134` (joint
  authorship — WP-133 created the route, WP-134 added fulfillment).
  The `Library-only` row for `processStripeEvent` is appended.

**Invariant locked here:** `legendary.entitlements` INSERT is
**idempotent** — re-running the processor on the same event must
not produce duplicate active entitlement rows. Tests assert this by
running the processor twice with the same event record and asserting
the entitlements row count is exactly 1. The
`UNIQUE INDEX ... WHERE revoked_at IS NULL` from WP-132 is the
defense; the `ON CONFLICT DO NOTHING` clause is the application-layer
acceptance of the no-op.

**Invariant locked here:** the cross-validation (event
`client_reference_id` ↔ `stripe_checkout_sessions.account_id`,
event `metadata.entitlementKey` ↔ `priceAllowlist[priceId]`)
MUST pass before any INSERT. Mismatch returns
`Result.fail({ code: 'cross_validation_failed' })` and is recorded
in `process_error`. Tests cover this branch — a tampered event
(unlikely after signature verification but defense-in-depth) is
rejected, not granted.

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. WP-134
> is the WP that grants monetization-derived entitlements. Every
> NG-1..NG-7 invariant must hold by construction. Vision Alignment
> is mandatory.

**Vision clauses touched:** §3 (Player Trust & Fairness), §11
(Stateless Client Philosophy), §14 (Explicit Decisions, No Silent
Drift), §15 (Built for Contributors), §765–794 (Financial
Sustainability), Non-Goals NG-1, NG-2, NG-3, NG-4, NG-5, NG-6, NG-7.

**Conflict assertion:** **No conflict: this WP preserves all touched
clauses.**

- **§3 Player Trust & Fairness.** Two-axis cross-validation
  (`client_reference_id` ↔ `stripe_checkout_sessions.account_id`
  AND `metadata.entitlementKey` ↔ `priceAllowlist[priceId]`)
  prevents a tampered event from granting entitlements to the
  wrong account or producing entitlement keys outside the
  allowlist. Both inputs were set by WP-133's server-side
  Checkout Session creation; if Stripe (or any party) replays an
  event with mismatched fields, the processor refuses.
- **§11 Stateless Client Philosophy.** The fulfillment path is
  entirely server-side. The client never sees the event; the
  client never adjudicates fulfillment; the client polls
  `GET /api/me/entitlements` (WP-132) to learn the result.
- **§14 Explicit Decisions, No Silent Drift.** Five Decision
  Points are surfaced. The synchronous-on-webhook posture is
  locked under D-DEC-1 with explicit alternatives. The
  cross-validation rule is locked at D-DEC-3 (no inference,
  both axes required, mismatch is `Result.fail`).
- **§15 Built for Contributors.** A contributor running locally
  without Stripe configured sees `'billing_not_configured'`
  503 from the webhook (WP-133's existing posture). With
  config but a malformed event, the processor returns a typed
  error code — never silent grant, never silent skip.
- **§765–794 Financial Sustainability.** WP-134 is the actual
  fulfillment of the Vision §784–794 streams #2 (one-time
  cosmetic purchases) per WP-133 D-DEC-7's MVP scope. After
  WP-134, the closed-loop monetization flow is live for
  cosmetic SKUs only.

**Non-Goal proximity check:** Confirmed clear.

- **NG-1 (pay-to-win):** The granted `entitlement_key` is
  resolved via the `BillingConfig.priceAllowlist` (WP-133) which
  maps every `priceId` to a member of `ENTITLEMENT_KEYS` (WP-132).
  WP-132's closed set is cosmetic-only. The processor cannot
  grant a gameplay-affecting key because no such key exists in
  the union.
- **NG-2 (gacha):** Deterministic 1-priceId-to-1-entitlement-key
  mapping. No randomization in fulfillment.
- **NG-3 (content withheld), NG-4..NG-7:** N/A — WP-132 / WP-133
  invariants inherited unchanged.

**Determinism preservation:** **N/A.** WP-134 touches no engine,
registry, scoring, replay, RNG, or simulation surface. The engine
never imports from `apps/server/src/billing/`. Replay determinism
(Vision §22, §24) unaffected.

---

## Funding Surface Gate (§20)

**§20 N/A.** **Justification:** WP-134 introduces the
fulfillment-side counterpart to WP-133's payment-tier purchase
flow. None of the §20.1 trigger surfaces (global navigation
funding, registry-viewer funding, profile funding-attribution,
tournament-funding integration, donate-language user-visible
copy) are touched. The processor is backend-only, with no
user-visible surface. The only user-visible state change is the
appearance of a new row in `GET /api/me/entitlements` (WP-132's
endpoint), which is paid-tier benefit visibility, not donation
attribution. Per the WP-132 / WP-133 §20 N/A justifications,
Vision §765–794 stream #2 (one-time cosmetic purchases) is
distinct from stream #3 (donations) and only stream #3 surfaces
trigger §20.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

WP-134 modifies the response shape of an existing endpoint
(`POST /api/billing/webhook/stripe`) and adds one new
`Library-only` function. §21 fires.

**Required catalog updates:**

1. **Replace the entire `POST /api/billing/webhook/stripe` row** per
   D-11804 replace-whole-row merge semantics. The new row carries:
   - `Status`: `Wired` (unchanged from WP-133)
   - `Method`: `POST` (unchanged)
   - `Path`: `/api/billing/webhook/stripe` (unchanged)
   - `Auth`: `guest` (unchanged — Stripe signature is the auth)
   - `Request Schema`: raw bytes verified via
     `stripe.webhooks.constructEvent` (unchanged)
   - `Response Schema`: 200 with `{ received: boolean; duplicate:
     boolean; processed: boolean; reason: string | null }`
     (CHANGED — added `processed` and `reason` fields per D-DEC-2);
     400 / 500 unchanged
   - `Authorizing WP`: `WP-133, WP-134` (CHANGED — joint authorship)
   - `Notes`: cite D-DEC-1 (synchronous-on-webhook posture); cite
     D-DEC-3 (two-axis cross-validation); cite WP-132 for
     `EntitlementKey` allowlist source

2. **Append one new `Library-only` row** for `processStripeEvent`:
   `Status: Library-only`; `Authorizing WP: WP-134`; `Notes`:
   "called synchronously by the webhook handler post-WP-134; also
   reachable via `scripts/process-stripe-events.mjs` for recovery".

---

## Assumes

- WP-052 / WP-115 / WP-118 / WP-132 / WP-133 complete.
- `apps/server/src/billing/billing.config.ts` exports
  `loadBillingConfig` returning a `BillingConfig` whose
  `priceAllowlist` field is `ReadonlyMap<string, EntitlementKey>`.
- `apps/server/src/billing/billing.logic.ts` exports
  `recordStripeEvent`.
- `apps/server/src/billing/billing.routes.ts` registers the
  webhook route per WP-133.
- `legendary.stripe_events`, `legendary.stripe_checkout_sessions`,
  `legendary.entitlements` exist with the schemas WP-132 + WP-133
  locked.
- `pnpm --filter @legendary-arena/server build/test` exits 0.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  fulfillment is server-layer; never engine.
- `docs/ai/ARCHITECTURE.md §Persistence Boundary` — entitlements +
  stripe_events are server-owned.
- `.claude/rules/architecture.md "Layer Boundary"`.
- `docs/ai/work-packets/WP-132-entitlements-data-model-and-me-read.md` —
  the table + closed union WP-134 INSERTs into.
- `docs/ai/work-packets/WP-133-stripe-checkout-session-and-webhook-ingestion.md` —
  the event ingestion + `BillingConfig.priceAllowlist` WP-134 reads.
- `docs/ai/REFERENCE/api-endpoints.md` — current state; WP-134
  replaces the WP-133 webhook row.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4, 6, 9, 11, 13, 14.
- `docs/01-VISION.md §765–794`, §NG-1..NG-7.
- `docs/ai/DECISIONS.md` — D-13201..D-13206 (WP-132); D-13301..D-13308 (WP-133).

---

## IMPORTANT — Entitlements FK Resolution (Post-WP-132 Reality)

WP-132 / EC-135 finalized `legendary.entitlements` with:

- `player_id bigint REFERENCES legendary.players(player_id) ON DELETE CASCADE`
- partial unique index `entitlements_active_unique ON (player_id, entitlement_key) WHERE revoked_at IS NULL`
- **NO `account_id text` column on `legendary.entitlements`**

The WP-134 v1.0 draft body's `INSERT INTO legendary.entitlements (..., account_id, ...)` shorthand and `ON CONFLICT (account_id, entitlement_key) WHERE revoked_at IS NULL` clause both reference a column name (`account_id`) that does not exist on the shipped table. Both are superseded by the shipped schema; the executor MUST use the corrected forms below in all production code:

- INSERT columns: `(player_id, entitlement_key, source, source_ref)` — NOT `(account_id, ...)`.
- `ON CONFLICT` target: `(player_id, entitlement_key) WHERE revoked_at IS NULL DO NOTHING` — matches the EC-135 / WP-132 partial unique index byte-for-byte.
- `accountId → player_id` resolution: a single SELECT before the INSERT, reusing the WP-104 / EC-135 two-query pattern (`ownerProfile.logic.ts:123` precedent):
  ```
  SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1
  ```
  The resolved `player_id` is what's bound to `$1` in the INSERT. The orchestration choice (resolve once at the top of `processStripeEvent` vs resolve inline at the INSERT site) is locked under D-13403 alongside the cross-validation lock.

This correction is reflected verbatim in EC-140 §0 #ENT-FK + #CONFLICT-TARGET pre-flight gates, EC-140 §2 Locked Values, EC-140 §3 Guardrails, and EC-140 Common Failure Smells. The WP design intent (idempotent INSERT keyed on the active-entitlement uniqueness pair) is unchanged — only the column name is corrected to match shipped reality.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- ESM only, Node v22+
- `node:` prefix on built-ins
- Test files use `.test.ts`
- Full file contents for every new or modified file
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- The INSERT site for `legendary.entitlements` lives EXACTLY in
  `processStripeEvent.logic.ts`. No other file under
  `apps/server/src/billing/` may contain `INSERT INTO
  legendary.entitlements`. Confirmed via `Select-String`.
- The INSERT clause MUST use `ON CONFLICT (account_id,
  entitlement_key) WHERE revoked_at IS NULL DO NOTHING`. The exact
  conflict target matches WP-132's partial unique index.
- **`processed_at` lifecycle (locked):**
  - `processed_at` is set ONLY when the event has reached a terminal
    successful outcome or an intentional no-op:
    `'fulfilled'` | `'duplicate'` | `'unhandled_event_type'` |
    `'unpaid_session'` | `'already_processed'`.
  - On any failure (`Result.fail({ code: ... })`), the processor MUST
    set `process_error = <full-sentence message>` and MUST leave
    `processed_at = NULL` so the recovery script's
    `WHERE processed_at IS NULL ORDER BY received_at ASC` selector
    continues to surface the row for retry. The recovery script
    treats `processed_at IS NULL` as "pending or failed".
  - **Trade-off (documented, not fixed in scope):** validation-class
    failures (`'session_lookup_failed'`, `'cross_validation_failed'`,
    `'price_not_in_allowlist'`) are deterministically terminal —
    re-running the processor against the same row produces the same
    failure. Under the locked semantic above, these rows loop in the
    recovery script every cycle, generating cron stderr noise as the
    operator-visibility signal. The trade-off is intentional: the
    alternative (marking validation failures `processed_at = now()`
    and silencing the noise) would let a real fulfillment bug hide.
    Operator runbook: persistent validation failures escalate to a
    manual `UPDATE stripe_events SET processed_at = now()` once the
    cause is understood and a follow-up WP (or DECISIONS.md entry)
    documents the resolution. A future WP may add a `retry_count`
    column or terminal-fault sentinel to mechanically distinguish
    transient (DB) from terminal (validation) failures; out of scope
    for WP-134.
- **Authoritative source for fulfillment data (locked):** the
  `legendary.stripe_checkout_sessions` row + `BillingConfig.priceAllowlist`
  are the authoritative sources for `accountId`, `priceId`, and
  `entitlementKey`. Event payload fields
  (`client_reference_id`, `metadata.entitlementKey`) are
  **consistency checks only** — they must agree with the
  authoritative sources, but they are never read as the primary
  truth. This preserves "signature verified but still defensive":
  Stripe signature verification establishes that the event came
  from Stripe; the session-row + allowlist establishes what the
  event SHOULD say.
- **Cross-validation is mandatory.** The processor MUST verify all
  of the following before INSERT:
  - The event's session-ID-keyed `legendary.stripe_checkout_sessions`
    row exists; miss → `'session_lookup_failed'`.
  - `payload.data.object.client_reference_id` equals
    `sessionRow.account_id`; mismatch → `'cross_validation_failed'`.
  - `payload.data.object.metadata.entitlementKey` equals
    `sessionRow.entitlement_key`; mismatch → `'cross_validation_failed'`.
  - `priceAllowlist.get(sessionRow.price_id)` equals
    `sessionRow.entitlement_key` (defends against env-config drift
    between WP-133 INSERT time and WP-134 fulfillment time); mismatch
    → `'price_not_in_allowlist'`.
- The webhook handler MUST always return 200 to Stripe on
  signature-verified events, regardless of fulfillment outcome.
  Returning 5xx triggers Stripe retries which compound the
  recorded-event ledger; the recovery script handles missed
  fulfillment.
- The processor MUST be deterministic and re-runnable. Running
  it twice for the same event row produces the same final state
  (one entitlement row, one `processed_at` timestamp from the
  first successful run; a second run on an already-`processed_at`-set
  row is a no-op skip with `reason: 'already_processed'`).
- **Write ordering (locked):** within a single `processStripeEvent`
  call, writes execute in this order: (a) entitlement INSERT, (b)
  stripe_checkout_sessions UPDATE, (c) stripe_events UPDATE
  (`processed_at = now()`). Step (c) is the LAST write on the
  success / no-op path.
- **Transaction requirement (locked):**
  - **MUST** wrap writes (a)–(c) in a single `BEGIN; ... COMMIT;`
    transaction IF `DatabaseClient` exposes a transaction primitive
    (matches the WP-104 `PUT /api/me/links` precedent for
    multi-statement transactions). The transactional path is the
    expected default — atomicity gives clearer reasoning at code-
    review time and removes the partial-write window entirely.
  - **MAY** fall back to deterministic-ordering-plus-idempotency IF
    `DatabaseClient` does not expose a transaction primitive. A
    crash between (a) and (c) leaves `processed_at = NULL` so the
    recovery script re-runs the row; the idempotent INSERT
    (`ON CONFLICT DO NOTHING`) and the idempotent UPDATE
    (`WHERE intent_status = 'open'`) both no-op on the second pass;
    (c) finally completes. Correctness is preserved without atomicity
    because every write is keyed by a guard that turns a re-run into
    a no-op.
  - The chosen path (transactional vs fallback) is locked in
    D-13403's DECISIONS.md entry alongside the FK-resolution choice.
- **Failure classes (locked semantics):** every `Result.fail` from
  `processStripeEvent` falls into one of two classes. BOTH classes
  leave `processed_at = NULL` and set `process_error = <full-sentence
  message>`. The classes differ in expected retry outcome, not in
  on-row state.
  - **Transient failures:** `'entitlement_insert_failed'`,
    `'session_update_failed'`, `'event_update_failed'`. Caused by
    DB-side faults (connection drop, deadlock, statement timeout).
    Retry is expected to eventually succeed once the underlying
    fault clears. The recovery script re-picks the row and writes
    `processed_at` on the next pass.
  - **Deterministic validation failures:** `'session_lookup_failed'`,
    `'cross_validation_failed'`, `'price_not_in_allowlist'`. Caused
    by the event referencing a session this server did not create,
    a tampered or drifted payload, or env-config drift between
    WP-133 INSERT time and WP-134 fulfillment time. Retry will NOT
    succeed without external correction (manual `UPDATE
    stripe_events SET processed_at = now()` once the cause is
    understood, OR a follow-up WP that adds a `retry_count` column /
    terminal-fault sentinel — out of scope for WP-134).
  - **Rationale for the unified `processed_at = NULL` posture:**
    preserves recovery-script visibility for both classes; avoids
    silent data loss on a real fulfillment bug; escalates
    deterministic faults via repeated cron-cycle surfacing
    (intentional operator-visibility signal). Choosing noise over
    silence aligns with the audit-first posture locked across the
    monetization chain (Vision §3, §14).
- **Idempotency dimensions (clarified — two independent axes):**
  - **Event-level idempotency:** governed by
    `legendary.stripe_events.processed_at`. Prevents re-processing
    of an already-finalized event. Outcome:
    `reason: 'already_processed'`. The Phase 1 early-return guard
    in `processStripeEvent` enforces this: if
    `eventRecord.processedAt !== null`, the processor skips all
    DB writes and returns `Result.ok({ value: { ...,
    reason: 'already_processed' } })`.
  - **Entitlement-level idempotency:** governed by the partial
    unique index `entitlements_active_unique ON (player_id,
    entitlement_key) WHERE revoked_at IS NULL`. Prevents duplicate
    active grants. Outcome: `reason: 'duplicate'`. The Phase 3
    `ON CONFLICT (player_id, entitlement_key) DO NOTHING RETURNING
    id` clause enforces this: if `RETURNING` returns 0 rows, the
    entitlement was already active and the processor returns
    `entitlementGranted: false, reason: 'duplicate'`.
  - **The two axes are independent by design.** A single event can
    produce `reason: 'duplicate'` on first processing (if a prior
    admin grant or earlier event already created the entitlement)
    AND then `reason: 'already_processed'` on re-delivery (because
    the first call set `processed_at`). Tests cover both axes
    independently.
- **Duplicate-delivery self-heal:** when WP-133's `recordStripeEvent`
  reports `inserted: false` (Stripe at-least-once retry), the
  webhook handler MUST load the existing event row by `event_id`
  and inspect `processed_at`. If `processed_at IS NULL` (first
  delivery's processing failed), the handler attempts
  `processStripeEvent` against the existing row — the duplicate is
  the retry opportunity. If `processed_at IS NOT NULL` (already
  terminally processed), the handler skips processing.
- **No external Stripe API calls inside `processStripeEvent`.** The
  processor is a pure DB-mutation path: SELECT from
  `stripe_checkout_sessions`, conditional INSERT into `entitlements`,
  conditional UPDATE on `stripe_checkout_sessions`, conditional
  UPDATE on `stripe_events`. Zero `stripeClient.*` invocations,
  zero `fetch(`, zero outbound HTTP. All Stripe-side data the
  processor needs was captured at WP-133 INSERT time
  (denormalized into `stripe_checkout_sessions`) or arrives in
  the event payload. This preserves the webhook-fast-return
  invariant and prevents Stripe-API rate-limiting from blocking
  fulfillment during incidents.
- **Webhook response field invariant:** when `processed: true`,
  `reason` is ALWAYS a populated `FulfillmentSuccessReason` string
  (one of the 5 closed-union values). When `processed: false`,
  `reason` is either a `FulfillmentErrorCode` string (Result.fail
  paths) OR `null` (the "duplicate-delivery skip" branch where
  `processStripeEvent` is not invoked because the existing row is
  already terminally processed). `reason: null` paired with
  `processed: true` is an invalid state and MUST NOT appear.
- No new npm dependencies.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask.

**Locked contract values:**

- **`processStripeEvent` signature:**
  ```
  processStripeEvent(args: {
    eventRecord: StripeEventRecord;
    billingConfig: BillingConfig;
    database: DatabaseClient;
  }): Promise<FulfillmentResult>
  ```
- **`FulfillmentResult` shape (matches WP-052 `Result<T>` precedent
  verbatim per the locked convention "Single-parameter `Result<T>`
  shape ..."):**
  ```
  | { ok: true; value: FulfillmentSuccess }
  | { ok: false; reason: string; code: FulfillmentErrorCode }
  ```
  Where `FulfillmentSuccess = { entitlementGranted: boolean;
  entitlementKey: EntitlementKey | null; sessionId: string | null;
  reason: FulfillmentSuccessReason }`.
- **`FulfillmentSuccessReason` closed union:** `'fulfilled' |
  'duplicate' | 'unhandled_event_type' | 'unpaid_session' |
  'already_processed'`.
- **`FulfillmentErrorCode` closed union:**
  `'session_lookup_failed' | 'cross_validation_failed' |
  'price_not_in_allowlist' | 'entitlement_insert_failed' |
  'event_update_failed' | 'session_update_failed'`.
- **Idempotency clause (post-#ENT-FK / #CONFLICT-TARGET correction):**
  `INSERT INTO legendary.entitlements (player_id, entitlement_key,
  source, source_ref) VALUES ($1, $2, 'stripe', $3) ON CONFLICT
  (player_id, entitlement_key) WHERE revoked_at IS NULL DO NOTHING
  RETURNING id`. `$1` is the bigint resolved via the WP-104 / EC-135
  two-query pattern (`SELECT player_id FROM legendary.players WHERE
  ext_id = $1`); `$2` is `sessionRow.entitlement_key` (NOT event
  metadata); `$3` is the Stripe Checkout Session ID. If `RETURNING`
  returns no row, the entitlement was already active —
  `entitlementGranted: false`, `reason: 'duplicate'`.
- **Webhook response shape (WP-134 extension):**
  `{ received: true; duplicate: boolean; processed: boolean;
  reason: string | null }`.
- **Recovery script path:** `scripts/process-stripe-events.mjs`.
- **Recovery script default batch size:** 100 rows per run; exits
  0 even on per-row errors (logs to stderr, summary to stdout).

---

## Debuggability & Diagnostics

- Every fulfillment outcome is recorded in
  `legendary.stripe_events.processed_at` (timestamp) and
  `process_error` (null on success, full-sentence message on
  failure). Forensics: `SELECT event_id, event_type, processed_at,
  process_error FROM legendary.stripe_events ORDER BY received_at
  DESC LIMIT 50`.
- The `legendary.stripe_checkout_sessions.intent_status` column
  transitions `'open'` → `'completed'` on successful fulfillment
  (with `completed_at` set). Stale `'open'` rows are recoverable
  via the recovery script.
- The recovery script's stdout summary (`processed: N, skipped:
  M, errors: K`) is the on-call signal for unprocessed-event
  backlog.
- Cross-validation failures log with full context (event ID,
  expected accountId, observed accountId) for support escalation.

### Operator Playbook (Forward Compatibility)

- **When the Phase 0a structural type guard fires** (Stripe sends a
  `checkout.session.completed` event whose `data.object` shape
  diverged from the locked predicate), the operator path is: (a)
  read `process_error` for the missing/wrong-typed field; (b)
  consult the Stripe API changelog at
  `https://docs.stripe.com/upgrades` for shape changes since the
  pinned `apiVersion` (`'2025-09-30.clover'` per WP-133 D-13303);
  (c) if a Stripe-side shape change is identified, schedule a
  follow-up WP that bumps `apiVersion` and updates the type guard
  in lockstep. Do NOT relax the guard inline — shape divergence is
  the load-bearing signal.
- **When the `intent_status === 'open'` guard fires** (event
  references a session that a future cancellation/expiry handler
  already moved out of `'open'`), the operator path is: (a) read
  `legendary.stripe_checkout_sessions.intent_status` for the
  session ID; (b) if `'expired'` or `'canceled'`, the event is
  legitimately a no-op race — manually `UPDATE stripe_events SET
  processed_at = now()` once cause is understood and document in
  DECISIONS.md; (c) if `'completed'` (the entitlement was already
  granted via an earlier path), the row hits `'duplicate'` not
  `'session_lookup_failed'` so this path should be unreachable —
  surface as a forensic anomaly.
- **When a future WP adds refunds** (writing `revoked_at` on
  entitlement rows in response to `charge.refunded` events), the
  partial unique index `entitlements_active_unique ON (player_id,
  entitlement_key) WHERE revoked_at IS NULL` allows re-grant of a
  previously-revoked key as a new row without colliding with the
  historical row. The grant flow in this WP is unchanged; the
  refund flow is additive. WP-134 ships with this seam intact —
  no code change required to enable it.
- **When the loud-fail throw fires for an unsupported event type**
  in a future event handler (out of scope here — WP-134 maps
  unknown types to `'unhandled_event_type'` no-op), the operator
  path follows the same cron-noise discipline as validation
  failures: the row keeps appearing in recovery-script output until
  resolved. Do not silence the noise by writing `processed_at` on
  the failure path — the noise IS the signal.

---

## Scope (In)

### A) `apps/server/src/billing/processStripeEvent.logic.ts` — new

`processStripeEvent({ eventRecord, billingConfig, database })`.
The body splits into four phases: (0a) structural type guard for
the `payload: unknown` field, (1) early-return guards for
already-processed / no-op event types, (2) cross-validation against
the server-recorded session row, (3) the **transactional fulfillment
write** that grants the entitlement and marks the event processed.

**Phase 0a — Structural payload type guard (no DB writes):**

`StripeEventRecord.payload` is typed `unknown` per WP-133 / EC-136
(the `payload jsonb` column carries the full Stripe envelope; the
`unknown` type forces every consumer to narrow before accessing
fields). `processStripeEvent` reads
`payload.data.object.{id, client_reference_id, metadata.entitlementKey,
payment_status}` and MUST narrow the `unknown` value via a local
structural type guard before any field access:

```
function isCheckoutSessionCompletedPayload(payload: unknown): payload is {
  readonly data: {
    readonly object: {
      readonly id: string;
      readonly client_reference_id: string;
      readonly metadata: { readonly entitlementKey: string };
      readonly payment_status: string;
    };
  };
} {
  // Strict, defensive shape check. All four fields must be present
  // and of the correct primitive type. Returns false on any mismatch
  // — the caller treats false as a Result.fail with code
  // 'cross_validation_failed' (event payload shape diverged from
  // the expected checkout.session.completed structure).
  // …predicate body…
}
```

If the guard returns `false` → return `Result.fail({ reason: 'event
payload shape did not match the expected checkout.session.completed
structure (see Stripe API docs for the canonical envelope)', code:
'cross_validation_failed' })`. Set `process_error` and leave
`processed_at = NULL` per the locked failure semantic.

The guard is local to `processStripeEvent.logic.ts` (NOT exported)
and has its own `node:test` coverage (one positive, four negatives —
one per missing/wrong-typed field) bundled into the Guards-domain
test set in §B.

**No new error code.** Shape-mismatch failures fall under existing
`'cross_validation_failed'`; the prose `reason` discriminates the
shape-mismatch sub-case from the metadata-mismatch sub-case for
forensic queries via `process_error`.

**Phase 1 — Early-return guards (no DB writes):**
1. If `eventRecord.processedAt !== null` → return `Result.ok({ value:
   { entitlementGranted: false, entitlementKey: null, sessionId:
   null, reason: 'already_processed' } })`.
2. If `eventRecord.eventType !== 'checkout.session.completed'` →
   UPDATE `legendary.stripe_events` set `processed_at = now()`,
   `process_error = NULL` WHERE `id = eventRecord.id` AND
   `processed_at IS NULL`. Return `Result.ok({ value:
   { entitlementGranted: false, ..., reason: 'unhandled_event_type'
   } })`.
3. If `eventRecord.payload.data.object.payment_status !== 'paid'` →
   UPDATE the same row (idempotent), return `reason:
   'unpaid_session'`. (Phase 0a already narrowed `payload`, so this
   field access is type-safe.)

**Phase 2 — Cross-validation (no DB writes):**
4. SELECT `account_id, price_id, entitlement_key, intent_status`
   FROM `legendary.stripe_checkout_sessions` WHERE `session_id =
   eventRecord.payload.data.object.id`. If miss → return
   `Result.fail({ reason: 'No stripe_checkout_sessions row exists
   for the event session ID; this event references a session this
   server did not create.', code: 'session_lookup_failed' })`. **Do
   NOT write `processed_at`** (per locked semantic — failures leave
   `processed_at = NULL`); set `process_error` only.
5. Cross-validate (five checks; any single mismatch fails fast):
   - `sessionRow.intent_status === 'open'` (else
     `'session_lookup_failed'` — extends the "session this server
     did not create" rationale to "session is no longer in a valid
     fulfillment state". The `'open' → 'completed'` transition
     happens at the END of Phase 3 step 8 atomically with the
     entitlement INSERT; the `'open' → 'expired' / 'canceled'`
     transitions are owned by future WPs handling
     `checkout.session.expired` / cancellation events. If a future
     WP transitions a session to `'expired'` BEFORE WP-134's
     fulfillment fires (delayed webhook delivery), this guard
     refuses to grant against a closed session).
   - `eventRecord.payload.data.object.client_reference_id ===
     sessionRow.account_id` (else `cross_validation_failed`).
   - `eventRecord.payload.data.object.metadata.entitlementKey ===
     sessionRow.entitlement_key` (else `cross_validation_failed`).
   - `priceAllowlist.get(sessionRow.price_id) ===
     sessionRow.entitlement_key` (defends against env-config drift;
     else `price_not_in_allowlist`).
   - `priceAllowlist.has(sessionRow.price_id)` is true (else
     `price_not_in_allowlist`). On any failure, write
     `process_error = <full-sentence message, capped at 2000 chars
     per the operator-internal `process_error` discipline>` and
     leave `processed_at = NULL`. Return `Result.fail({ reason:
     <message>, code })`.

**Phase 3 — Transactional fulfillment write:**
6. **Resolve `accountId → player_id`** (per §IMPORTANT — Entitlements
   FK Resolution). SELECT `player_id FROM legendary.players WHERE
   ext_id = $1 LIMIT 1`, with `$1 = sessionRow.account_id` (the
   `text` value already cross-validated against
   `payload.data.object.client_reference_id` in Phase 2). On miss →
   return `Result.fail({ code: 'cross_validation_failed', reason:
   'session row references a player ext_id that does not exist in
   legendary.players (this is a referential-integrity failure that
   should be impossible given the FK CASCADE on
   stripe_checkout_sessions; surface for forensic review)' })`. The
   miss is operationally distinct from `'session_lookup_failed'` —
   the session row exists; the referenced player is gone.
   `process_error` set + `processed_at` LEFT NULL.
7. Open transaction (`BEGIN;`). If `DatabaseClient` exposes a
   transaction primitive → MUST use a single `BEGIN; ... COMMIT;`
   (per WP-104 multi-statement transaction precedent). If NOT
   exposed → MAY fall back to deterministic-ordering-plus-
   idempotency. Choice locked in D-13403.
8. INSERT INTO `legendary.entitlements (player_id, entitlement_key,
   source, source_ref) VALUES ($1, $2, 'stripe', $3) ON CONFLICT
   (player_id, entitlement_key) WHERE revoked_at IS NULL DO NOTHING
   RETURNING id`. `$1` is the `player_id bigint` resolved at step
   6; `$2` is `sessionRow.entitlement_key` (NOT the event's
   `metadata.entitlementKey` — the session row is authoritative);
   `$3` is `eventRecord.payload.data.object.id` (the Stripe Checkout
   Session ID — `cs_*`, soft-cap 200 chars). If RETURNING returns 1
   row → `entitlementGranted: true`, `reason: 'fulfilled'`. If 0 rows
   → `entitlementGranted: false`, `reason: 'duplicate'`. On DB fault
   → ROLLBACK; return `Result.fail({ code:
   'entitlement_insert_failed' })` with `process_error` set
   (full-sentence DB-driver message, soft-cap 2000 chars) +
   `processed_at` LEFT NULL.
9. UPDATE `legendary.stripe_checkout_sessions` SET `intent_status =
   'completed'`, `completed_at = now()` WHERE `session_id = $1`
   AND `intent_status = 'open'`. Idempotent — a re-run hits zero
   rows and is a no-op. On DB fault → ROLLBACK; return
   `Result.fail({ code: 'session_update_failed' })` with
   `process_error` set + `processed_at` LEFT NULL.
10. **LAST WRITE:** UPDATE `legendary.stripe_events` SET `processed_at
    = now()`, `process_error = NULL` WHERE `id = eventRecord.id`
    AND `processed_at IS NULL`. On DB fault → ROLLBACK; return
    `Result.fail({ code: 'event_update_failed' })`. **`processed_at`
    IS WRITTEN ONLY IN STEP 10** — the success path's last write. A
    crash between step 8 and step 10 leaves `processed_at = NULL`,
    which is correct: the recovery script will re-pick the row, and
    steps 8 + 9 will idempotently no-op while step 10 finally
    completes.
11. `COMMIT;` (if step 7 opened a transaction).
12. Return `Result.ok({ value: { entitlementGranted, entitlementKey:
    sessionRow.entitlement_key, sessionId:
    eventRecord.payload.data.object.id, reason } })`.

`// why:` comments required on:
- The Phase 0a structural type guard (cite the `payload: unknown`
  type lock from WP-133; cite that shape mismatches map to existing
  `'cross_validation_failed'` rather than introducing a new error
  code; cite that `process_error` discriminates the shape sub-case
  from the metadata sub-case for forensic queries).
- The Phase 2 `intent_status === 'open'` cross-validation check
  (cite the future-WP `'expired'` / `'canceled'` transition surface;
  cite that fulfillment against a non-`'open'` session is refused as
  a defense against delayed webhook delivery race conditions).
- The Phase 3 step 6 `accountId → player_id` resolution (cite the
  WP-104 / EC-135 two-query pattern; cite that
  `legendary.entitlements.player_id` is `bigint` FK to
  `legendary.players.player_id`, NOT `text` to `ext_id`).
- The Phase 3 step 8 `ON CONFLICT (player_id, entitlement_key)`
  clause (cite WP-132 partial unique index byte-for-byte; cite the
  application-layer `DO NOTHING` as the idempotency acceptance
  signal; cite RETURNING-row-count as the `'fulfilled'` vs
  `'duplicate'` discriminator).
- The "leave `processed_at = NULL` on failure" branches (cite the
  recovery-script `WHERE processed_at IS NULL` filter — failures
  must remain pickable; setting `processed_at = now()` on failure
  would make events terminally lost).
- The "step 10 is last" ordering (cite the locked write-ordering
  constraint and the crash-recovery guarantee — idempotency at
  steps 8–9 + `processed_at = NULL` survival means a partial-write
  crash heals on the next recovery-script pass).
- The `process_error` write site (cite that the column is
  operator-internal; future UI exposure requires sanitization WP;
  soft-cap 2000 chars to keep recovery-script summaries readable).

### B) `apps/server/src/billing/processStripeEvent.logic.test.ts` — new

`node:test` coverage for every branch. Each failure-path test
asserts BOTH the returned `Result.fail` AND the `legendary.stripe_events`
row state (`process_error` set, `processed_at` LEFT NULL — the locked
semantic):

- Already-processed event (`processed_at` non-NULL on input) →
  `Result.ok({ value: { reason: 'already_processed' } })`; no DB
  writes occur.
- Unhandled event type (e.g., `'payment_intent.succeeded'`) →
  `'unhandled_event_type'`; row's `processed_at` set, `process_error`
  NULL.
- `payment_status: 'unpaid'` → `'unpaid_session'`; row's
  `processed_at` set, `process_error` NULL.
- Successful first fulfillment → entitlement row exists with
  `source = 'stripe'`, `source_ref = <session_id>`; session row
  shows `intent_status = 'completed'` + `completed_at` set; event
  row shows `processed_at` set + `process_error` NULL.
- Idempotent re-run → second call returns `'duplicate'`,
  entitlement row count unchanged, session row unchanged
  (idempotent UPDATE no-op).
- Session lookup miss → `Result.fail({ code: 'session_lookup_failed' })`;
  event row's `process_error` set, **`processed_at` LEFT NULL** (the
  recovery script must continue to surface this row).
- `client_reference_id` ↔ session.account_id mismatch →
  `'cross_validation_failed'`; `process_error` set, `processed_at`
  NULL.
- `metadata.entitlementKey` ↔ session.entitlement_key mismatch →
  `'cross_validation_failed'`; `process_error` set, `processed_at`
  NULL.
- `priceAllowlist.get(price_id)` ↔ session.entitlement_key
  mismatch (env-config drift since WP-133 INSERT) →
  `'price_not_in_allowlist'`; `process_error` set, `processed_at`
  NULL.
- DB fault on entitlement INSERT → `'entitlement_insert_failed'`;
  `process_error` set, `processed_at` NULL.
- DB fault on session UPDATE → `'session_update_failed'`;
  `process_error` set, `processed_at` NULL (entitlement INSERT
  succeeded but is recoverable on next pass via idempotency).
- DB fault on stripe_events UPDATE (step 10) →
  `'event_update_failed'`; `process_error` set, `processed_at` NULL.
- **Phase 0a structural type guard tests (5 — bundled into the
  Guards domain):** 1 positive (canonical
  `checkout.session.completed` payload narrows successfully); 4
  negatives — one per missing/wrong-typed field
  (`data.object.id` missing; `client_reference_id` non-string;
  `metadata.entitlementKey` missing; `payment_status` non-string).
  Each negative asserts `Result.fail({ code:
  'cross_validation_failed' })` + `process_error` set + `processed_at`
  NULL.
- **`intent_status` non-`'open'` test:** seed a `stripe_checkout_sessions`
  row with `intent_status = 'expired'`; assert
  `'session_lookup_failed'` + `process_error` set + `processed_at`
  NULL. Same for `'canceled'`.
- **`accountId → player_id` resolution miss test:** seed a session
  row whose `account_id` (text) does not exist in `legendary.players.ext_id`
  (referential-integrity edge case); assert
  `'cross_validation_failed'` + `process_error` set + `processed_at`
  NULL.
- **Crash-recovery test:** simulate a partial-write failure between
  Phase 3 step 8 and step 10 (entitlement INSERT succeeded, stripe_events
  UPDATE not run); re-run `processStripeEvent`; assert second pass returns
  `Result.ok({ value: { reason: 'duplicate' } })` and event row's
  `processed_at` is now set. This test proves the locked
  write-ordering + idempotency guarantee.
- **Recovery selectability test:** any failure-path test asserts
  that `SELECT * FROM legendary.stripe_events WHERE processed_at
  IS NULL AND id = <test event id>` returns one row — the recovery
  script's selector must keep finding the failed event.
- Tests inline-skip when `hasTestDatabase` is false (per D-5201 §3.1).

### C) `apps/server/src/billing/billing.routes.ts` — modified

Modify the existing `POST /api/billing/webhook/stripe` handler. The
handler now has two branches based on `recordStripeEvent`'s
`inserted` flag:

**Branch 1 — Newly-inserted event (`inserted === true`):**
- **Re-fetch the inserted event row by `event_id`** via the shared
  helper `loadStripeEventRecordByEventId(pool, event_id)` (same SELECT
  the duplicate-delivery branch uses — see §C-helper below). The
  shipped `recordStripeEvent` (WP-133 / EC-136) returns
  `BillingResult<{ inserted: boolean }>` only — the row itself is NOT
  returned. Re-fetching is a single indexed `SELECT ... WHERE event_id
  = $1` against the UNIQUE index, ≤5ms in the typical case. The two
  webhook branches now share one helper; no duplicate SELECT logic.
- Pass the re-fetched record into `processStripeEvent({ eventRecord,
  billingConfig: deps.billingConfig, database: pool })`.
- Build response per the locked `processed` semantic:
  `{ received: true; duplicate: false; processed: result.ok;
  reason: result.ok ? result.value.reason : result.code }`. The
  `processed` field reflects "terminal outcome reached" — true on
  any `Result.ok` regardless of `result.value.reason` (so
  `'unhandled_event_type'`, `'unpaid_session'`, and
  `'already_processed'` all set `processed: true`); false only on
  `Result.fail`. The `reason` field carries the closed-set string
  on success or the `FulfillmentErrorCode` on failure.

**Branch 2 — Duplicate delivery (`inserted === false`) — self-heal:**
- Re-fetch the existing event row via the SAME shared helper
  `loadStripeEventRecordByEventId(pool, event_id)`.
- If `existingRow.processed_at IS NOT NULL` (already terminally
  processed), skip processing entirely. Response: `{ received:
  true; duplicate: true; processed: false; reason: null }`.
- If `existingRow.processed_at IS NULL` (first delivery's processing
  failed or has not yet completed), call
  `processStripeEvent({ eventRecord: existingRow, ... })`. This
  turns the duplicate into the retry opportunity rather than
  waiting for the recovery-script cron cadence. Response shape
  matches Branch 1 with `duplicate: true`.

**Shared helper — `loadStripeEventRecordByEventId(pool, eventId):
Promise<StripeEventRecord | null>`:**
- Local function in `billing.routes.ts` (NOT exported; the function
  is webhook-handler-internal). Pure SELECT:
  ```
  SELECT id, event_id, event_type, payload, received_at,
         processed_at, process_error
    FROM legendary.stripe_events
   WHERE event_id = $1
  ```
- Maps the row to the `StripeEventRecord` interface (snake_case
  columns → camelCase fields per WP-133 mapping). Returns `null` if
  the row is absent — defense against a race where `recordStripeEvent`
  reports `inserted: true` but the row is gone (e.g., a concurrent
  test-database wipe). On `null`, the handler logs to stderr and
  returns 500 `{ error: 'internal_error' }` per the existing
  always-return-200-on-signature-verified-events caveat: the row
  being absent after a successful INSERT is a serious internal
  inconsistency that justifies signaling Stripe to retry.
- The helper MUST consume the long-lived `pool` from
  `registerBillingRoutes`'s second positional parameter — never
  construct a new `pg.Pool`. WP-115 wiring-site singleton invariant
  preserved.

**Always return 200** on signature-verified events regardless of
`processStripeEvent` outcome (the row-absent edge case above is the
sole exception; it indicates internal inconsistency, not fulfillment
failure). Fulfillment errors are logged to stderr (full-sentence
message + `event_id` + error code) but the response is 200 to prevent
Stripe-driven retry storms (per locked constraint above).

The route's `deps` bundle does NOT change shape:
`billingConfig` is already present in WP-133's deps shape from EC-136
close.

### D) `scripts/process-stripe-events.mjs` — new

ESM script. Loads env via `node --env-file=.env`.

**Lifecycle posture (locked, two distinct phases):**

- **Startup phase — fatal on missing config.** `loadBillingConfig`
  is called first; it throws on missing env vars in production per
  WP-133 / EC-136 close. Recovery script catches the throw and
  exits **non-zero (exit code 2)** with a full-sentence stderr
  message naming the missing var(s). The cron operator wants to
  know billing config is broken — this is the same posture as the
  server entrypoint at `apps/server/src/server.mjs`. Missing env
  vars are an operator-actionable fault (not a transient DB hiccup);
  exiting non-zero pages cron correctly.
- **Scan-loop phase — exit 0 on per-row errors.** Once `billingConfig`
  + `pg.Pool` are constructed, the script SELECTs `WHERE processed_at
  IS NULL ORDER BY received_at ASC LIMIT 100` and calls
  `processStripeEvent` per row. Any per-row `Result.fail` is logged
  to stderr (full-sentence message + `event_id` + error code) and
  the loop continues to the next row. After the loop, the script
  prints `processed: <N>, skipped: <M>, errors: <K>` to stdout and
  exits **0** even when `K > 0`. Per-row errors are recorded in
  `legendary.stripe_events.process_error` for forensic review;
  paging cron on every transient DB hiccup is the wrong noise level.

**Pool teardown (locked).** Wrap the scan loop in a
`try { … } finally { await pool.end(); }` envelope so connections
release cleanly on every exit path (success, exception, scan-loop
error). The recovery-script pool is short-lived per cron invocation
— the WP-115 long-lived `pg.Pool` invariant applies only to the
server process; the recovery script constructs its own pool, uses
it within the cron cycle, and disposes it before exit. Mirrors the
WP-126 / EC-130 short-lived rules-loader pool precedent.

**Stripe SDK confinement (inherited from EC-136).** Recovery script
imports `loadBillingConfig` (and, if needed, `createStripeClient`)
from `apps/server/src/billing/billing.config.js` — NEVER directly
from `'stripe'`. The Stripe SDK boundary established by EC-136 §5
extends to `scripts/`.

**Output contract.** `processed: <N>, skipped: <M>, errors: <K>`
where:
- `processed` = count of rows that returned `Result.ok` (any
  `FulfillmentSuccessReason`).
- `skipped` = count of rows already in a terminal state at fetch
  time (e.g., `processed_at` raced from NULL to non-NULL between
  SELECT and per-row dispatch — the early-return guard catches it
  and returns `'already_processed'`; counted separately from
  `processed` for operator clarity).
- `errors` = count of rows that returned `Result.fail`. Each error
  row's `event_id` + error code is logged to stderr immediately
  after the per-row dispatch, so the operator can grep stderr by
  `event_id` for diagnostic context.

**Exit codes (locked):**
- `0` — scan completed (with or without per-row errors).
- `2` — startup failure (missing env var, config parse error,
  initial DB connection failure).

The `1` exit code is reserved for unexpected JS exceptions
escaping the `try/finally` — Node's default crash exit. Any
exit-1 incident is operator-paged via cron's stderr capture.

### E) `apps/server/src/billing/billing.routes.test.ts` — modified

Extend existing tests:
- 200 response with new `processed` + `reason` fields.
- `processed: true` is asserted for every successful `Result.ok`
  outcome including `'unhandled_event_type'` / `'unpaid_session'` /
  `'already_processed'` (terminal-no-op outcomes are still
  "processed" — the handler reached a terminal state without error).
- `processed: false` is asserted only for `Result.fail` outcomes.
- Webhook handler calls `processStripeEvent` exactly once on
  newly-inserted events.
- **Self-heal duplicate-delivery branch:** seed an event row with
  `processed_at IS NULL` (simulating first-delivery processing
  failure); send a second webhook with the same `event_id`; assert
  the handler loads the existing row and calls `processStripeEvent`
  against it.
- **Skip duplicate-delivery branch:** seed an event row with
  `processed_at` non-NULL (already terminally processed); send a
  second webhook with the same `event_id`; assert the handler does
  NOT call `processStripeEvent` and returns `{ duplicate: true,
  processed: false, reason: null }`.
- Webhook handler returns 200 even when `processStripeEvent`
  returns `Result.fail(...)` (verified by an injected fault that
  causes session-lookup to throw).

### F) Catalog + governance updates

- `docs/ai/REFERENCE/api-endpoints.md` — replace the WP-133
  webhook row whole; append `Library-only` row for
  `processStripeEvent`.
- `docs/ai/STATUS.md` — append WP-134 close entry. Note that the
  full purchase-to-entitlement loop is now live for cosmetic SKUs.
- `docs/ai/DECISIONS.md` — append D-13401..D-13405.
- `docs/ai/work-packets/WORK_INDEX.md` — check off WP-134.

---

## Out of Scope

- Refunds / `charge.refunded` handler — future WP that writes
  `revoked_at` on entitlement rows.
- Subscription lifecycle (`customer.subscription.deleted` etc.) —
  out of scope per WP-133 D-DEC-7 deferral.
- Admin grant tool — out of scope.
- Failure-retry queue / dead-letter — out of scope; recovery
  script handles backlog.
- Profile-page UI showing benefits — out of scope; future
  arena-client WP.
- Email notifications — out of scope.
- Refactors, cleanups, or "while I'm here" improvements are out
  of scope.

---

## Files Expected to Change

- `apps/server/src/billing/processStripeEvent.logic.ts` — **new** — the fulfillment processor
- `apps/server/src/billing/processStripeEvent.logic.test.ts` — **new** — branch coverage + idempotency
- `apps/server/src/billing/billing.routes.ts` — **modified** — webhook handler calls `processStripeEvent` after `recordStripeEvent`
- `apps/server/src/billing/billing.routes.test.ts` — **modified** — extend webhook tests
- `scripts/process-stripe-events.mjs` — **new** — recovery script
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — replace WP-133 webhook row whole; append Library-only row
- `docs/ai/STATUS.md` — **modified** — append WP-134 close entry
- `docs/ai/DECISIONS.md` — **modified** — append D-13401..D-13405
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-134

No other files may be modified. WP-134 introduces no new migration.

---

## Decision Points

### D-DEC-1 — Synchronous-on-Webhook vs Queue [DECISION REQUIRED]

**Question.** When does fulfillment run relative to the webhook
HTTP request?

(a) **Synchronous, in-line with webhook handler (recommended
default):** WP-134's webhook handler calls `processStripeEvent`
after `recordStripeEvent` and before returning 200 to Stripe.
The handler's response time grows by ~50–200 ms per event (one
SELECT + one INSERT + two UPDATEs). Stripe's webhook timeout
window is 30s; we are well under.

(b) **Asynchronous via a queue:** Webhook handler records the
event and returns 200 immediately. A separate worker process
consumes from a queue (in-Postgres job table or external broker)
and runs `processStripeEvent`. Adds operational complexity (worker
process, dead-letter handling).

(c) **Asynchronous via cron / recovery script only:** Webhook
handler records the event; nothing fulfills inline. The recovery
script runs every N minutes via cron. Latency grows to N minutes;
operationally simpler but the user-facing experience degrades
(post-purchase, "Your benefits" UI is empty until cron fires).

**Constraints (locked at draft time):**
- Whichever path is chosen, fulfillment MUST be idempotent
  (already locked above).
- The webhook handler MUST return 200 to Stripe on
  signature-verified events regardless of fulfillment outcome.
- The recovery script (Scope item D) is MANDATORY regardless of
  inline / queue choice — it handles backlog from any
  fulfillment-side fault.

**Recommended default:** Option (a) — synchronous-on-webhook.
Rationale: at MVP scale (low transaction rate), the operational
simplicity of a single code path beats the throughput-and-isolation
benefits of a queue. The recovery script is the safety net for
the rare case where inline fulfillment fails. Option (b) is the
right answer at higher scale (future WP). Option (c) degrades UX
unnecessarily at MVP.

### D-DEC-2 — Webhook Response Schema Extension [DECISION REQUIRED]

**Question.** Does the webhook response shape extend, or stay
WP-133's shape?

(a) **Extend (recommended default):** Response becomes
`{ received: true; duplicate: boolean; processed: boolean;
reason: string | null }`. WP-133's existing
`{ received, duplicate }` becomes a strict subset.

(b) **Stay WP-133 shape:** Webhook response is unchanged.
Operational visibility into fulfillment outcome lives only in
DB (`processed_at`, `process_error`).

**Constraints (locked at draft time):**
- Stripe never reads the webhook response body; the response
  shape is for our own ops dashboards / log inspection only.
- Whichever shape is chosen, the catalog row update reflects it
  per D-11804 replace-whole-row semantics.
- **`reason` is a closed-set string union, not free-form `string`.**
  On `Result.ok`, `reason` is one of `'fulfilled'` | `'duplicate'`
  | `'unhandled_event_type'` | `'unpaid_session'` |
  `'already_processed'` (the `FulfillmentSuccessReason` union).
  On `Result.fail`, `reason` is one of `'session_lookup_failed'` |
  `'cross_validation_failed'` | `'price_not_in_allowlist'` |
  `'entitlement_insert_failed'` | `'session_update_failed'` |
  `'event_update_failed'` (the `FulfillmentErrorCode` union). The
  catalog Notes column lists both unions verbatim so log
  consumers can write exhaustive matchers.

**Recommended default:** Option (a) — extend. Rationale:
zero-cost observability win. A grep over webhook response logs
during incident response is faster than a DB query; the extended
shape preserves grep parity with the DB state. Option (b) is
acceptable but gives up the ops UX win for nothing.

### D-DEC-3 — Cross-Validation Strictness [DECISION REQUIRED]

**Question.** How strict is the event ↔ session cross-validation?

(a) **Two-axis (recommended default):** Both
`client_reference_id ↔ stripe_checkout_sessions.account_id` AND
`metadata.entitlementKey ↔ priceAllowlist[priceId] ↔
stripe_checkout_sessions.entitlement_key` must agree. Three-way
match on the second axis (event metadata, price allowlist
lookup, denormalized session row).

(b) **One-axis (`client_reference_id` only):** Trust event
metadata for `entitlementKey`. Simpler.

(c) **No cross-validation:** Trust the signature verification
in WP-133. Treat event metadata as authoritative.

**Constraints (locked at draft time):**
- Whichever path is chosen, WP-132's NG-1 invariant must hold:
  the granted `entitlement_key` MUST be a member of
  `ENTITLEMENT_KEYS`. Closed-union TypeScript enforcement is
  the floor.
- **Authoritative source vs consistency check (locked):** the
  `legendary.stripe_checkout_sessions` row + `BillingConfig.priceAllowlist`
  are the **authoritative sources** for `accountId`, `priceId`,
  and `entitlementKey`. Event payload fields
  (`payload.data.object.client_reference_id`,
  `payload.data.object.metadata.entitlementKey`) are **consistency
  checks only** — they must agree with the authoritative sources,
  but they are never the primary truth used to construct the
  entitlement INSERT. This preserves "signature verified but still
  defensive": Stripe signature verification establishes that the
  event came from Stripe; the session-row + allowlist establishes
  what the event SHOULD say.

**Recommended default:** Option (a) — two-axis with three-way
match on the entitlement axis. Rationale: defense-in-depth.
WP-133 already verifies the Stripe signature, so an external
attacker cannot inject events; but option (a) defends against
metadata-mutation bugs in our own future code (e.g., a future
WP changes Checkout Session creation and forgets to keep the
denormalized `entitlement_key` column in sync). Option (b) is
acceptable but gives up cheap drift defense. Option (c) flunks
the §3 trust posture.

### D-DEC-4 — Always-200 Response Posture [DECISION REQUIRED]

**Question.** Does the webhook handler return 200 even when
`processStripeEvent` returns `Result.fail(...)`?

(a) **Always 200 on signature-verified events (recommended
default):** Fulfillment errors are recorded in DB and reported
in the response body's `processed: false, reason: <code>`. Stripe
does not retry. Recovery script handles the backlog.

(b) **5xx on fulfillment failure:** Stripe retries on 5xx (per
Stripe docs, with exponential backoff up to 3 days). Lighter
ops because retries are automatic, but compounds the recorded
event ledger and risks fulfillment loops if the failure is
deterministic.

**Constraints (locked at draft time):**
- Whichever path is chosen, fulfillment MUST be idempotent. (a)
  is safe regardless; (b) is also safe given idempotency.
- The recovery script handles backlog under (a). Under (b),
  Stripe handles retries automatically AND the recovery script
  is still run for events where Stripe gave up.

**Recommended default:** Option (a) — always 200. Rationale:
deterministic ops. We control the retry loop via the recovery
script; Stripe-driven retries can compound during incidents
(e.g., DB outage triggers retries that compound load when DB
recovers). The recorded-event ledger is the single source of
truth for backlog.

### D-DEC-5 — Recovery Script Scheduling [DECISION REQUIRED]

**Question.** How is `scripts/process-stripe-events.mjs`
scheduled?

(a) **Manual + Render Cron Job (recommended default):** Script
is invokable manually for incident response (`node --env-file=.env
scripts/process-stripe-events.mjs`). Production cron schedule
configured in `render.yaml` to run every 15 minutes.

(b) **Manual only at MVP:** No cron. Script exists for ops
escalation; backlog is monitored via dashboard query.

(c) **In-process timer:** The server process runs the recovery
on a `setInterval` schedule. Tightest coupling; survives
process restart only via timer reinit.

**Constraints (locked at draft time):**
- Whichever path is chosen, the script MUST exit 0 even on
  per-row errors (so cron does not page on transient faults).
- Cron schedule (if (a)) MUST not collide with other periodic
  jobs (verify against `render.yaml` cron section).
- **Run-overlap posture (future-scaling note, not enforced at MVP):**
  the recovery script's `LIMIT 100` plus expected per-row processing
  time (≤200 ms each → ≤20 s total) means a 15-minute cron cadence
  cannot reasonably overlap at MVP scale. If concurrency ever
  becomes a concern (high-volume incident, multi-instance recovery),
  the SELECT can be hardened with `FOR UPDATE SKIP LOCKED` to make
  concurrent runs safe. Out of scope for WP-134; documented here
  so a future scaling WP cites this as the precedent rather than
  re-deriving from scratch.

**Recommended default:** Option (a) — manual + cron.
Rationale: cron at 15-minute cadence catches the rare inline
fulfillment failure within an acceptable user-facing window;
manual invocation is the incident-response lever. Option (b)
risks invisible backlog. Option (c) couples ops surface to
the request-handling process which is undesirable.

---

## Acceptance Criteria

### Library
- [ ] `processStripeEvent.logic.ts` exports `processStripeEvent({eventRecord, billingConfig, database})`
- [ ] `INSERT INTO legendary.entitlements` appears EXACTLY once under `apps/server/src/billing/`, in this file (confirmed with `Select-String`)
- [ ] INSERT clause uses `ON CONFLICT (player_id, entitlement_key) WHERE revoked_at IS NULL DO NOTHING RETURNING id` (post-#CONFLICT-TARGET correction — `player_id`, NOT `account_id`)
- [ ] INSERT column list is `(player_id, entitlement_key, source, source_ref)` (post-#ENT-FK correction)
- [ ] **Phase 0a structural type guard `isCheckoutSessionCompletedPayload`** is the FIRST check in `processStripeEvent`; shape mismatch returns `Result.fail({ code: 'cross_validation_failed' })`; the guard has 5 dedicated tests (1 positive, 4 negatives — one per missing/wrong-typed field)
- [ ] **`accountId → player_id` resolution** uses the WP-104 / EC-135 two-query pattern (`SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1`); a missing player returns `'cross_validation_failed'` (referential-integrity miss; not `'session_lookup_failed'`)
- [ ] Five-axis cross-validation runs before INSERT (intent_status='open', client_reference_id, metadata.entitlementKey, priceAllowlist mapping, priceAllowlist membership) — fail-fast on first mismatch
- [ ] **Cross-validation failure leaves `processed_at = NULL`** with `process_error` set; verified by `SELECT processed_at FROM legendary.stripe_events WHERE id = <test event id>` returning NULL post-failure
- [ ] **Write ordering: `processed_at` is set ONLY by step 10** (the last write on the success / no-op path); confirmed by reading the source file (no `processed_at = now()` UPDATE in the failure branches under §A Phase 2/3)
- [ ] **Authoritative source is the session row + allowlist**, not event payload — verified by code review that `entitlementKey` passed to INSERT is read from `sessionRow.entitlement_key`, not from `event.metadata.entitlementKey`
- [ ] **No `payload.line_items` reference** anywhere under `apps/server/src/billing/` (confirmed with `Select-String "line_items"`)
- [ ] **No type-cast escapes after Phase 0a guard** — zero `as any` / `as unknown` / `as string` matches in `processStripeEvent.logic.ts` (the structural guard narrows once; further casts would defeat the narrowing)
- [ ] **`process_error` soft-cap 2000 chars** at every write site (operator-internal column; future UI exposure requires sanitization WP)
- [ ] `FulfillmentResult` matches WP-052 `Result<T>` shape verbatim — success path is `{ ok: true; value: FulfillmentSuccess }`, failure path is `{ ok: false; reason: string; code: FulfillmentErrorCode }`

### Routes
- [ ] `billing.routes.ts` calls `processStripeEvent` synchronously on newly-inserted events
- [ ] **Shared `loadStripeEventRecordByEventId(pool, eventId)` helper** is used by BOTH the newly-inserted branch and the duplicate-delivery branch to fetch the row from `legendary.stripe_events` by `event_id`; the function is local to `billing.routes.ts` (NOT exported)
- [ ] **No `RETURNING *` modification to `recordStripeEvent`** — `billing.logic.ts` is unchanged (path (a) per PS-1 resolution; path (b) was rejected as scope-violation against WP-133 contract)
- [ ] **Self-heal duplicate-delivery branch:** when `recordStripeEvent` returns `inserted: false`, the handler loads the existing event row via the shared helper and inspects `processed_at`; if NULL, calls `processStripeEvent` against the existing row
- [ ] **Skip duplicate-delivery branch:** when the existing row's `processed_at` is non-NULL, the handler does NOT call `processStripeEvent`
- [ ] **Row-absent edge case:** if the shared helper returns `null` after `recordStripeEvent` reported `inserted: true` (concurrent test-database wipe or comparable inconsistency), handler logs to stderr and returns 500 `{ error: 'internal_error' }` — the only exception to the always-200 posture
- [ ] **Webhook handler MUST consume long-lived `pool`** from `registerBillingRoutes`'s second positional parameter; zero `new Pool(` constructions inside `billing.routes.ts` (verified by `Select-String`)
- [ ] Webhook returns 200 even when `processStripeEvent` fails (per D-13404)
- [ ] Response shape matches `{ received: true; duplicate: boolean; processed: boolean; reason: string | null }`
- [ ] **Response shape construction uses conditional assignment** for the `reason` field (per `exactOptionalPropertyTypes: true` strictness; build base object without `reason`, then assign in `if` blocks per the WP-029 / D-2902 precedent)
- [ ] `processed: true` for every `Result.ok` outcome (including terminal-no-op `'unhandled_event_type'` / `'unpaid_session'` / `'already_processed'`); `processed: false` only for `Result.fail` (per terminal-outcome-reached semantic)
- [ ] **Invariant: `reason: null` paired with `processed: true` is impossible** — verified by reviewer reading source + at least one test asserting `processed: true; reason: 'unhandled_event_type'` (a closed-set string, never null)

### Recovery script
- [ ] `scripts/process-stripe-events.mjs` exists and runs without arguments
- [ ] **Startup-phase posture:** missing env vars exit non-zero (exit code 2) with full-sentence stderr message naming the missing var(s)
- [ ] **Scan-loop posture:** per-row errors logged to stderr (full-sentence message + `event_id` + error code); loop continues; final exit 0 even when `errors > 0`
- [ ] **Pool teardown:** scan loop wrapped in `try { ... } finally { await pool.end(); }` envelope (verified by code review)
- [ ] **No direct `'stripe'` import** — recovery script imports `loadBillingConfig` (and any Stripe factory) from `apps/server/src/billing/billing.config.js`; `Select-String -Path "scripts" -Pattern "from 'stripe'"` returns no output
- [ ] Reads at most 100 unprocessed events per invocation
- [ ] Prints `processed: N, skipped: M, errors: K` summary to stdout — `skipped` includes rows that raced from NULL→non-NULL between SELECT and dispatch
- [ ] Exit code domain locked: `0` (scan completed) | `2` (startup failure) | `1` (unexpected JS exception)

### Catalog
- [ ] WP-133 webhook row replaced wholesale per D-11804 (response shape includes `processed` + `reason`; `Authorizing WP` is `WP-133, WP-134`)
- [ ] One new `Library-only` row for `processStripeEvent`

### Tests
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
- [ ] All thirteen branches of `processStripeEvent` covered: already-processed, unhandled-type, unpaid, success, duplicate idempotency, session miss, account mismatch, entitlement-key mismatch, price-allowlist drift, INSERT fault, session-update fault, event-update fault, crash-recovery (partial-write resume)
- [ ] Idempotency test asserts entitlement row count = 1 after running processor twice
- [ ] **Recovery selectability test:** every failure-path test asserts `SELECT * FROM legendary.stripe_events WHERE processed_at IS NULL AND id = <test event id>` returns one row (the recovery script must keep finding failed events)
- [ ] **Crash-recovery test:** simulate partial-write between steps 7–9; second pass returns `Result.ok({ value: { reason: 'duplicate' } })` and final `processed_at` is set
- [ ] **Routes self-heal test:** seed an event with `processed_at IS NULL`; second webhook with same `event_id` triggers `processStripeEvent` against the existing row
- [ ] Tests inline-skip when `hasTestDatabase` is false

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` modified
- [ ] No new migration introduced

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/server build
# Expected: exits 0

# Step 2 — tests
pnpm --filter @legendary-arena/server test
# Expected: TAP — all passing

# Step 3 — confirm exactly one INSERT site for entitlements
Select-String -Path "apps\server\src\billing" -Pattern "INSERT INTO legendary\.entitlements" -Recurse
# Expected: exactly one match (in processStripeEvent.logic.ts)

# Step 4 — confirm ON CONFLICT clause matches WP-132 partial unique index
Select-String -Path "apps\server\src\billing\processStripeEvent.logic.ts" -Pattern "ON CONFLICT \(account_id, entitlement_key\) WHERE revoked_at IS NULL DO NOTHING"
# Expected: at least one match

# Step 5 — confirm cross-validation present
Select-String -Path "apps\server\src\billing\processStripeEvent.logic.ts" -Pattern "client_reference_id|cross_validation_failed"
# Expected: matches

# Step 5b — confirm no reliance on payload.line_items (Stripe omits this from checkout.session.completed without expansion)
Select-String -Path "apps\server\src\billing" -Pattern "line_items" -Recurse
# Expected: no output

# Step 5c — confirm no processed_at = now() in failure branches (only step 9 success path)
Select-String -Path "apps\server\src\billing\processStripeEvent.logic.ts" -Pattern "processed_at = now\(\)"
# Expected: occurrences only in success / no-op paths (steps 2, 3, 9); reviewer confirms by reading source — no occurrence inside any Result.fail branch

# Step 6 — confirm webhook handler calls processStripeEvent
Select-String -Path "apps\server\src\billing\billing.routes.ts" -Pattern "processStripeEvent"
# Expected: at least one match

# Step 7 — confirm recovery script exists and is invokable
node --env-file=.env scripts\process-stripe-events.mjs
# Expected: prints summary "processed: 0, skipped: 0, errors: 0" against an empty events table

# Step 8 — confirm no new migration
git diff --name-only data/migrations/
# Expected: empty (WP-134 introduces no migration)

# Step 9 — confirm catalog updates
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "WP-133, WP-134|processStripeEvent"
# Expected: matches for both the joint-authoring webhook row and the new Library-only row

# Step 10 — scope boundary
git diff --name-only
# Expected: only files in ## Files Expected to Change
```

---

## Definition of Done

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
- [ ] Idempotency test passes (running processor twice on the same event leaves entitlement row count at 1)
- [ ] Cross-validation tests pass (mismatch on either axis returns `'cross_validation_failed'` and produces no entitlement row)
- [ ] Recovery script runs against an empty unprocessed set without error
- [ ] No new migration file in `data/migrations/`
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated per D-11804 replace-whole-row (one row replaced, one row appended)
- [ ] `docs/ai/STATUS.md` updated — full purchase-to-entitlement loop is live for cosmetic SKUs
- [ ] `docs/ai/DECISIONS.md` updated — D-13401..D-13405
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-134 checked off
- [ ] 01.5 NOT INVOKED
- [ ] 01.6 post-mortem OPTIONAL

---

## Lint Self-Review (00.3)

- §1 Structure — PASS
- §2 Constraints — PASS (engine-wide + packet-specific + protocol + locked values; full file contents required; references 00.6)
- §3 Assumes — PASS (WP-052 / WP-115 / WP-118 / WP-132 / WP-133 listed with specific exports / tables consumed)
- §4 Context — PASS (ARCHITECTURE.md sections + WP-132 / WP-133 + DECISIONS scan)
- §5 Files Expected — PASS (9 files; all marked new/modified; bounded; no ambiguous output)
- §6 Naming — PASS (`accountId`, `entitlementKey`, `sessionId`, `priceId`, `processedAt`, `processError` per 00.2)
- §7 Dependencies — PASS (no new npm dependencies)
- §8 Architectural Boundaries — PASS (server-layer only; INSERT site confined; no engine import)
- §9 Windows — PASS (PowerShell `Select-String`; `\` separators; `node --env-file=.env`)
- §10 Env vars — PASS (no new vars; recovery script reads existing WP-133 vars via `--env-file`)
- §11 Authentication — PASS (webhook is `guest` per WP-133 inheritance; no JWT change)
- §12 Test quality — PASS (`node:test` only; no boardgame.io import; tests stub the database client; inline-skip pattern)
- §13 Verification — PASS (pnpm only; exact `Select-String` patterns; expected outputs inline)
- §14 Acceptance criteria — PASS (binary, observable, ~25 items grouped by sub-task)
- §15 Definition of Done — PASS (acceptance + build + test + STATUS + DECISIONS + WORK_INDEX + scope-boundary + no-migration check)
- §16 Code style — PASS
- §17 Vision Alignment — PASS (clauses cited; no-conflict; non-goal proximity check; determinism N/A)
- §18 Prose-vs-grep — PASS (the `INSERT INTO legendary.entitlements` Verification grep is intentionally scoped to find exactly one match in code, and this WP's prose discusses the INSERT site explicitly because that IS the legitimate code change WP-134 introduces; no false-positive risk)
- §19 Bridge-vs-HEAD — N/A at draft
- §20 Funding Surface Gate — PASS via N/A path (justification: backend-only fulfillment processor for paid-tier purchases; no §20.1 trigger surfaces touched; UI surface is future arena-client WP)
- §21 API Catalog — PASS (one row replaced wholesale per D-11804 with the response-schema extension; one new `Library-only` row appended; canonical field names match 00.2)
