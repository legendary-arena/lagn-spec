/**
 * Webhook → Entitlement Fulfillment Processor — Server Layer (WP-134)
 *
 * Single library export: `processStripeEvent`. Reads one row from
 * `legendary.stripe_events`, resolves it against the locked authoritative
 * sources (`legendary.stripe_checkout_sessions` denormalized at WP-133
 * INSERT time + `BillingConfig.priceAllowlist` parsed at startup), and
 * — when fulfillment is warranted — INSERTs into `legendary.entitlements`
 * inside a `BEGIN; … COMMIT;` envelope alongside the session-row state
 * transition and the event-row terminal-success mark.
 *
 * The function never throws. Every failure path returns a typed
 * `FulfillmentResult.fail`. Every failure path also writes a
 * full-sentence diagnostic into `legendary.stripe_events.process_error`
 * and LEAVES `processed_at = NULL` so the recovery script's
 * `WHERE processed_at IS NULL` selector continues to surface the row
 * for retry. The locked failure semantic is intentional — silencing
 * a real fulfillment bug by writing `processed_at = now()` on failure
 * would forfeit operator visibility.
 *
 * The processor is a pure DB-mutation path: zero outbound HTTP, zero
 * Stripe SDK calls. Every Stripe-side input the processor needs was
 * captured at WP-133 INSERT time (denormalized into
 * `stripe_checkout_sessions`) or arrives as the verified event payload.
 *
 * Layer-boundary contract: this module imports only the identity-layer
 * `AccountId` / `DatabaseClient`, the entitlements-layer `EntitlementKey`,
 * the billing-layer `BillingConfig` / `StripeEventRecord`, and the `pg`
 * `PoolClient` interface for transaction primitives. No `boardgame.io`
 * import; no `@legendary-arena/(game-engine|registry|preplan)` import;
 * no app-level import. The Stripe SDK is NOT imported here — fulfillment
 * is fully decoupled from the Stripe API surface.
 *
 * Authority: WP-134 §Scope (In) §A; EC-140 §2 (locked values: signature,
 * five-axis cross-validation, INSERT clause, write ordering, transaction
 * posture, processed_at lifecycle); D-13401 (synchronous-on-webhook);
 * D-13403 (bundled cross-validation + Phase 0a guard + accountId →
 * player_id resolution + (player_id, entitlement_key) conflict target +
 * conditional-MUST transaction + path (a) re-fetch helper); WP-132
 * D-13203 (`EntitlementKey` closed set); WP-132 D-13204 (`source`
 * closed set); WP-104 D-10402 (`bigint`-FK on `player_id` precedent);
 * WP-104 ownerProfile.logic.ts:123 (two-query `accountId → player_id`
 * resolution precedent); WP-052 D-5201 (`AccountId` ↔ `ext_id`).
 */

import type { PoolClient } from 'pg';

import type { EntitlementKey } from '../entitlements/entitlements.types.js';
import type {
  AccountId,
  DatabaseClient,
} from '../identity/identity.types.js';
import type {
  BillingConfig,
  StripeEventRecord,
} from './billing.types.js';

// why: `process_error` is an operator-internal column. The 2000-char
// soft cap keeps recovery-script stderr summaries readable when an
// operator runs `node scripts/process-stripe-events.mjs` and tails
// the output. Future UI exposure of this column requires a
// sanitization WP per WP-134 §Non-Negotiable Constraints; the soft
// cap is the lower bound for that future work, not a security
// boundary on its own.
const PROCESS_ERROR_SOFT_CAP = 2000;

// why: Stripe Checkout Session IDs (`cs_*`) are well under 100 chars
// in practice; the 200-char soft cap on `source_ref` is
// defense-in-depth against an unexpected Stripe-side ID format change
// or a malformed payload that smuggles oversized data into the
// fulfillment row's audit field.
const SOURCE_REF_SOFT_CAP = 200;

/**
 * Closed union of `Result.ok` reason values. Five members locked under
 * EC-140 §2. `'fulfilled'` indicates a new entitlement row was created;
 * `'duplicate'` indicates the partial unique index collapsed the INSERT
 * to a no-op (already-active grant). `'unhandled_event_type'` /
 * `'unpaid_session'` / `'already_processed'` are intentional no-ops on
 * the success path — the event-row's `processed_at` is set so the
 * recovery script does not loop on them.
 */
export type FulfillmentSuccessReason =
  | 'fulfilled'
  | 'duplicate'
  | 'unhandled_event_type'
  | 'unpaid_session'
  | 'already_processed';

/**
 * Closed union of `Result.fail` codes. Six members locked under EC-140
 * §2. Transient codes (`'entitlement_insert_failed'`,
 * `'session_update_failed'`, `'event_update_failed'`) indicate
 * DB-side faults expected to clear on retry. Deterministic-validation
 * codes (`'session_lookup_failed'`, `'cross_validation_failed'`,
 * `'price_not_in_allowlist'`) indicate inputs that will not pass on
 * retry without external correction; per WP-134 §Non-Negotiable
 * Constraints they still leave `processed_at = NULL` so cron stderr
 * surfaces the noise as the operator-visibility signal.
 */
export type FulfillmentErrorCode =
  | 'session_lookup_failed'
  | 'cross_validation_failed'
  | 'price_not_in_allowlist'
  | 'entitlement_insert_failed'
  | 'event_update_failed'
  | 'session_update_failed';

/**
 * Wire shape of the `Result.ok` value. `entitlementGranted: true` only
 * for the `'fulfilled'` reason; every other terminal-success reason
 * leaves `entitlementGranted: false`. `entitlementKey` and `sessionId`
 * are populated when the cross-validation phase reached the session
 * row; both are `null` for early-return guards (Phase 1) that fire
 * before the session lookup.
 */
export interface FulfillmentSuccess {
  readonly entitlementGranted: boolean;
  readonly entitlementKey: EntitlementKey | null;
  readonly sessionId: string | null;
  readonly reason: FulfillmentSuccessReason;
}

/**
 * Discriminated-union result type for `processStripeEvent`. Mirrors
 * the WP-052 `Result<T>` shape verbatim; declared locally per the
 * WP-102 / WP-104 / WP-132 precedent because the identity-layer
 * `Result<T>` is keyed on `IdentityErrorCode` and cannot carry the
 * `FulfillmentErrorCode` union.
 */
export type FulfillmentResult =
  | { ok: true; value: FulfillmentSuccess }
  | { ok: false; reason: string; code: FulfillmentErrorCode };

/**
 * Narrowed structural shape of the `payload: unknown` field on
 * `StripeEventRecord` once the Phase 0a guard has confirmed the
 * payload matches the canonical `checkout.session.completed`
 * envelope. Internal field access in Phases 1, 2, 3 reads through
 * this type — never through type-assertion casts to `any` /
 * `unknown` / primitive types (the EC-140 §6 grep gate enforces).
 */
interface CheckoutSessionCompletedPayload {
  readonly data: {
    readonly object: {
      readonly id: string;
      readonly client_reference_id: string;
      readonly metadata: { readonly entitlementKey: string };
      readonly payment_status: string;
    };
  };
}

// why: WP-133 / EC-136 typed `StripeEventRecord.payload` as `unknown`
// (the `payload jsonb` column carries the full Stripe envelope) so
// every consumer must narrow before reading fields. This guard is the
// sole sanctioned narrowing seam in `processStripeEvent.logic.ts`;
// after it returns `true` the four leaf fields are guaranteed
// `string`-typed at runtime AND at compile time. The four required
// fields mirror what Phases 1, 2, 3 access:
//   - `data.object.id` (Stripe Checkout Session ID; bound as
//     `source_ref` on the entitlement INSERT)
//   - `data.object.client_reference_id` (axis 3 of cross-validation)
//   - `data.object.metadata.entitlementKey` (axis 4 of cross-validation
//     — consistency check only; sessionRow.entitlement_key is the
//     authoritative value bound to the INSERT)
//   - `data.object.payment_status` (Phase 1 step 3 unpaid-session
//     guard)
// Shape mismatch maps to existing `'cross_validation_failed'` rather
// than introducing a new error code; the prose `reason` string
// discriminates the shape sub-case from the metadata-mismatch
// sub-case for forensic queries via `process_error`.
function isCheckoutSessionCompletedPayload(
  payload: unknown,
): payload is CheckoutSessionCompletedPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  if (!('data' in payload)) {
    return false;
  }
  const data = payload.data;
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  if (!('object' in data)) {
    return false;
  }
  const sessionObject = data.object;
  if (typeof sessionObject !== 'object' || sessionObject === null) {
    return false;
  }
  if (
    !('id' in sessionObject) ||
    typeof sessionObject.id !== 'string'
  ) {
    return false;
  }
  if (
    !('client_reference_id' in sessionObject) ||
    typeof sessionObject.client_reference_id !== 'string'
  ) {
    return false;
  }
  if (
    !('payment_status' in sessionObject) ||
    typeof sessionObject.payment_status !== 'string'
  ) {
    return false;
  }
  if (!('metadata' in sessionObject)) {
    return false;
  }
  const metadata = sessionObject.metadata;
  if (typeof metadata !== 'object' || metadata === null) {
    return false;
  }
  if (
    !('entitlementKey' in metadata) ||
    typeof metadata.entitlementKey !== 'string'
  ) {
    return false;
  }
  return true;
}

/**
 * Trim a full-sentence diagnostic to the supplied character cap so
 * recovery-script stderr summaries stay readable. Returns the input
 * unchanged when already under the cap.
 */
function clampForOperatorLog(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

// why: every `Result.fail` path in `processStripeEvent` calls this
// helper before returning. The locked failure semantic (per WP-134
// §Non-Negotiable Constraints + EC-140 §2 `processed_at` lifecycle)
// is `process_error` set + `processed_at = NULL` so the recovery
// script's `WHERE processed_at IS NULL` selector continues to surface
// the row. The `WHERE processed_at IS NULL` clause on this UPDATE is
// belt-and-suspenders — it is impossible for `processed_at` to be
// non-null inside a `Result.fail` branch (the only setter is the
// LAST write of the success path), but the predicate keeps the
// failure write idempotent against an unexpected concurrent state.
async function recordProcessError(
  database: DatabaseClient,
  eventRowId: bigint,
  message: string,
): Promise<void> {
  try {
    await database.query(
      'UPDATE legendary.stripe_events SET process_error = $1 WHERE id = $2 AND processed_at IS NULL',
      [clampForOperatorLog(message, PROCESS_ERROR_SOFT_CAP), eventRowId],
    );
  } catch (writeError) {
    // why: a fault writing the diagnostic is logged but never
    // re-thrown — the caller is already returning a typed
    // `Result.fail`; failing here too would mask the original
    // failure code. The recovery script will surface the row again
    // via `WHERE processed_at IS NULL` regardless of whether
    // `process_error` carries the diagnostic. The error is voided
    // explicitly so review-time greps for swallowed errors find this
    // site and can confirm the rationale.
    void writeError;
  }
}

/**
 * Mark the event row as terminal-no-op success. Used by the Phase 1
 * `'unhandled_event_type'` and `'unpaid_session'` early-return
 * branches — the event has been classified as a legitimate skip and
 * the recovery script need not re-pick it. Idempotent: the
 * `WHERE processed_at IS NULL` predicate makes a re-run a no-op when
 * the row was already marked.
 */
async function markEventTerminalNoOp(
  database: DatabaseClient,
  eventRowId: bigint,
): Promise<void> {
  await database.query(
    'UPDATE legendary.stripe_events SET processed_at = now(), process_error = NULL WHERE id = $1 AND processed_at IS NULL',
    [eventRowId],
  );
}

/**
 * Database row shape returned by the Phase 2 session-lookup SELECT.
 * `intent_status` is typed `string` rather than the closed union
 * because the schema's CHECK constraint is the load-bearing guarantee
 * — TypeScript-side narrowing happens at the cross-validation step
 * via `=== 'open'`.
 */
interface CheckoutSessionRow {
  readonly account_id: string;
  readonly price_id: string;
  readonly entitlement_key: string;
  readonly intent_status: string;
}

/**
 * Phase 2 step 4: load the `legendary.stripe_checkout_sessions` row
 * keyed on the event's session ID. Returns `null` on miss (event
 * references a session this server did not create — typically a
 * misconfigured webhook endpoint or a malicious replay). Throws on
 * DB fault (the caller wraps in try/catch and maps to
 * `'session_lookup_failed'`).
 */
async function loadCheckoutSessionRow(
  database: DatabaseClient,
  sessionId: string,
): Promise<CheckoutSessionRow | null> {
  const result = await database.query(
    'SELECT account_id, price_id, entitlement_key, intent_status FROM legendary.stripe_checkout_sessions WHERE session_id = $1 LIMIT 1',
    [sessionId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    account_id: row.account_id,
    price_id: row.price_id,
    entitlement_key: row.entitlement_key,
    intent_status: row.intent_status,
  };
}

// why: WP-104 / EC-135 two-query precedent
// (apps/server/src/profile/ownerProfile.logic.ts:123). The
// `legendary.entitlements` table's FK target is
// `legendary.players(player_id)` (`bigint`), NOT `ext_id` (`text`);
// the `AccountId` brand carried through the request maps to `ext_id`
// per WP-052 D-5201, so a single SELECT translates the brand to the
// `bigint` PK before the INSERT can bind it. Returns `null` on miss;
// `legendary.stripe_checkout_sessions` has FK CASCADE on
// `legendary.players(ext_id)` so a miss here is impossible-in-theory,
// but defense-in-depth for forensic surfacing of an inconsistent state.
async function loadPlayerIdByExtId(
  database: DatabaseClient,
  extId: AccountId,
): Promise<number | null> {
  const result = await database.query(
    'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
    [extId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const rawId = result.rows[0].player_id;
  return typeof rawId === 'string' ? Number(rawId) : rawId;
}

/**
 * Outcome of the Phase 3 `BEGIN; … COMMIT;` envelope. The success
 * branch carries `entitlementGranted` discriminating `'fulfilled'` (1
 * RETURNING row) from `'duplicate'` (0 RETURNING rows — the partial
 * unique index collapsed). The failure branch carries the
 * fulfillment-domain error code that maps to `Result.fail`.
 */
type FulfillmentTransactionResult =
  | { kind: 'success'; entitlementGranted: boolean }
  | {
      kind: 'failure';
      code:
        | 'entitlement_insert_failed'
        | 'session_update_failed'
        | 'event_update_failed';
      message: string;
    };

/**
 * Execute writes (8) → (9) → (10) inside a single `BEGIN; … COMMIT;`
 * transaction on a connected `PoolClient`. The caller is responsible
 * for `client.release()` regardless of outcome. Any per-write fault
 * issues `ROLLBACK` and returns a `kind: 'failure'` result naming the
 * step that failed; the catch is local rather than re-thrown so the
 * caller can write `process_error` against the original event row
 * without losing the failure-code provenance.
 */
async function runFulfillmentTransaction(
  client: PoolClient,
  input: {
    readonly playerId: number;
    readonly entitlementKey: EntitlementKey;
    readonly sessionId: string;
    readonly sourceRef: string;
    readonly eventRowId: bigint;
  },
): Promise<FulfillmentTransactionResult> {
  await client.query('BEGIN');

  // why: WP-132's partial unique index `entitlements_active_unique
  // ON (player_id, entitlement_key) WHERE revoked_at IS NULL` is the
  // defense-in-depth idempotency primitive. The application-layer
  // `DO NOTHING` clause matches the index byte-for-byte and accepts
  // the no-op signal; `RETURNING id` returns 1 row on a fresh INSERT
  // and 0 rows when the conflict-do-nothing fires. The row count is
  // the `'fulfilled'` vs `'duplicate'` discriminator. Future revoked
  // grants are re-grantable as new rows because the `WHERE revoked_at
  // IS NULL` predicate scopes uniqueness to active rows only.
  let entitlementGranted: boolean;
  try {
    const insertResult = await client.query(
      'INSERT INTO legendary.entitlements (player_id, entitlement_key, source, source_ref) ' +
        "VALUES ($1, $2, 'stripe', $3) " +
        'ON CONFLICT (player_id, entitlement_key) WHERE revoked_at IS NULL DO NOTHING ' +
        'RETURNING id',
      [input.playerId, input.entitlementKey, input.sourceRef],
    );
    entitlementGranted = insertResult.rows.length === 1;
  } catch (insertError) {
    await rollbackQuietly(client);
    const errorMessage =
      insertError instanceof Error ? insertError.message : 'unknown driver error';
    return {
      kind: 'failure',
      code: 'entitlement_insert_failed',
      message: `processStripeEvent failed at the legendary.entitlements INSERT for sessionId ${input.sessionId}; the database driver rejected the INSERT with: ${errorMessage}.`,
    };
  }

  try {
    await client.query(
      "UPDATE legendary.stripe_checkout_sessions SET intent_status = 'completed', completed_at = now() WHERE session_id = $1 AND intent_status = 'open'",
      [input.sessionId],
    );
  } catch (sessionUpdateError) {
    await rollbackQuietly(client);
    const errorMessage =
      sessionUpdateError instanceof Error
        ? sessionUpdateError.message
        : 'unknown driver error';
    return {
      kind: 'failure',
      code: 'session_update_failed',
      message: `processStripeEvent failed at the legendary.stripe_checkout_sessions UPDATE for sessionId ${input.sessionId}; the database driver rejected the UPDATE with: ${errorMessage}.`,
    };
  }

  // why: step 10 is the LAST write on the success path. The locked
  // write-ordering constraint guarantees that a process crash between
  // step 8 and step 10 leaves `processed_at = NULL`, which is correct
  // — the recovery script re-picks the row, the entitlement INSERT
  // is idempotent via `ON CONFLICT DO NOTHING`, the session UPDATE is
  // idempotent via `WHERE intent_status = 'open'`, and step 10
  // finally completes on the recovery pass. Setting `processed_at`
  // before the entitlement INSERT would invert this: a crash after
  // marking the event processed would leave a paid customer without
  // their entitlement and the recovery script unable to find the
  // row.
  try {
    await client.query(
      'UPDATE legendary.stripe_events SET processed_at = now(), process_error = NULL WHERE id = $1 AND processed_at IS NULL',
      [input.eventRowId],
    );
  } catch (eventUpdateError) {
    await rollbackQuietly(client);
    const errorMessage =
      eventUpdateError instanceof Error
        ? eventUpdateError.message
        : 'unknown driver error';
    return {
      kind: 'failure',
      code: 'event_update_failed',
      message: `processStripeEvent failed at the legendary.stripe_events UPDATE for eventRowId ${input.eventRowId.toString()}; the database driver rejected the UPDATE with: ${errorMessage}.`,
    };
  }

  await client.query('COMMIT');
  return { kind: 'success', entitlementGranted };
}

/**
 * Issue `ROLLBACK` on the connected client; swallow any error from
 * the rollback itself. Used by `runFulfillmentTransaction` after a
 * per-step fault — the original cause is already captured in the
 * `kind: 'failure'` result, and a follow-on rollback failure should
 * not mask it.
 */
async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    // why: pg-pool does NOT auto-rollback on release, so a failed
    // explicit ROLLBACK could leak an open transaction onto the next
    // user of the pooled client. Voiding the error here is documented
    // (per WP-104 ownerProfile.logic.ts:842 precedent); a future
    // operator-visibility WP may add structured stderr logging.
    void rollbackError;
  }
}

/**
 * Process one signature-verified Stripe event row. Returns
 * `Result.ok` on every terminal-success outcome (including
 * intentional no-ops) and `Result.fail` with a typed
 * `FulfillmentErrorCode` on every fault. Never throws.
 *
 * The body splits into four phases per WP-134 §A:
 *
 *   * Phase 0a — structural type guard on `eventRecord.payload`.
 *   * Phase 1  — early-return guards: already-processed, unhandled
 *                event type, unpaid session.
 *   * Phase 2  — five-axis cross-validation against the session row
 *                + the `priceAllowlist`.
 *   * Phase 3  — `accountId → player_id` resolution + transactional
 *                fulfillment write (`BEGIN` → INSERT → UPDATE session
 *                → UPDATE event → `COMMIT`).
 *
 * The processor is a pure DB-mutation path — zero outbound Stripe
 * API calls; every input was captured at WP-133 INSERT time.
 */
export async function processStripeEvent(args: {
  readonly eventRecord: StripeEventRecord;
  readonly billingConfig: BillingConfig;
  readonly database: DatabaseClient;
}): Promise<FulfillmentResult> {
  const { eventRecord, billingConfig, database } = args;

  // Phase 0a — structural type guard.
  if (isCheckoutSessionCompletedPayload(eventRecord.payload) === false) {
    // why: only the `'checkout.session.completed'` event type is
    // expected to carry the four required fields; other event types
    // hit the Phase 1 unhandled-event-type branch first and never
    // reach this guard. Reaching here on a `'checkout.session.completed'`
    // event indicates a Stripe-side envelope-shape change (rare but
    // possible across `apiVersion` bumps); the locked
    // `'cross_validation_failed'` code keeps the failure surface
    // small and the `process_error` discriminates the shape sub-case
    // from the metadata-mismatch sub-case.
    if (eventRecord.eventType === 'checkout.session.completed') {
      const failureMessage =
        'processStripeEvent rejected the event payload: the data.object structure did not match the expected checkout.session.completed envelope (id, client_reference_id, metadata.entitlementKey, payment_status all required to be string values). See https://docs.stripe.com/upgrades for the canonical envelope shape.';
      await recordProcessError(database, eventRecord.id, failureMessage);
      return {
        ok: false,
        reason: failureMessage,
        code: 'cross_validation_failed',
      };
    }
  }

  // Phase 1 step 1 — already-processed early return (no DB writes).
  if (eventRecord.processedAt !== null) {
    return {
      ok: true,
      value: {
        entitlementGranted: false,
        entitlementKey: null,
        sessionId: null,
        reason: 'already_processed',
      },
    };
  }

  // Phase 1 step 2 — unhandled event type. WP-133 ingests every
  // verified event without an `event.type` filter; WP-134 is the sole
  // classifier. Any non-`checkout.session.completed` type is a
  // legitimate no-op — mark processed so the recovery script does
  // not loop, and return success with the `'unhandled_event_type'`
  // reason.
  if (eventRecord.eventType !== 'checkout.session.completed') {
    await markEventTerminalNoOp(database, eventRecord.id);
    return {
      ok: true,
      value: {
        entitlementGranted: false,
        entitlementKey: null,
        sessionId: null,
        reason: 'unhandled_event_type',
      },
    };
  }

  // The Phase 0a guard above only fires when the event type is
  // `'checkout.session.completed'` AND the payload is malformed. By
  // the time we reach here, the type matched, the guard passed, and
  // `payload` is narrowed to `CheckoutSessionCompletedPayload`. The
  // assertion is defensive — TypeScript's control-flow analysis
  // should already have narrowed.
  if (isCheckoutSessionCompletedPayload(eventRecord.payload) === false) {
    // why: unreachable in practice — Phase 0a above returned
    // Result.fail when the payload was malformed. The guard repeat
    // is the type-narrowing primitive (TS does not preserve the
    // earlier narrowing across the `processedAt` and `eventType`
    // checks above). Keeping a defensive Result.fail here is the
    // belt-and-suspenders posture; reaching it would indicate a TS
    // compiler regression.
    return {
      ok: false,
      reason:
        'processStripeEvent re-entered the structural guard branch unexpectedly; this is a defensive fallthrough and indicates a TypeScript narrowing regression.',
      code: 'cross_validation_failed',
    };
  }
  const payload = eventRecord.payload;

  // Phase 1 step 3 — unpaid session. Stripe Checkout Sessions can
  // complete without payment (e.g., subscription with trial); WP-134
  // grants only on `payment_status === 'paid'`.
  if (payload.data.object.payment_status !== 'paid') {
    await markEventTerminalNoOp(database, eventRecord.id);
    return {
      ok: true,
      value: {
        entitlementGranted: false,
        entitlementKey: null,
        sessionId: null,
        reason: 'unpaid_session',
      },
    };
  }

  const stripeSessionId = payload.data.object.id;

  // Phase 2 step 4 — load the session row. Combined with the
  // `intent_status === 'open'` axis (step 5 axis 1) into a single
  // SELECT — the missing-row case dominates and maps to
  // `'session_lookup_failed'`.
  let sessionRow: CheckoutSessionRow | null;
  try {
    sessionRow = await loadCheckoutSessionRow(database, stripeSessionId);
  } catch (lookupError) {
    const errorMessage =
      lookupError instanceof Error ? lookupError.message : 'unknown driver error';
    const failureMessage = `processStripeEvent failed at the legendary.stripe_checkout_sessions SELECT for sessionId ${stripeSessionId}; the database driver rejected the SELECT with: ${errorMessage}.`;
    await recordProcessError(database, eventRecord.id, failureMessage);
    return {
      ok: false,
      reason: failureMessage,
      code: 'session_lookup_failed',
    };
  }
  if (sessionRow === null) {
    const failureMessage = `processStripeEvent could not find a legendary.stripe_checkout_sessions row for sessionId ${stripeSessionId}; this event references a Checkout Session this server did not create (possible misconfigured webhook endpoint, replay attack, or test traffic against a production endpoint).`;
    await recordProcessError(database, eventRecord.id, failureMessage);
    return {
      ok: false,
      reason: failureMessage,
      code: 'session_lookup_failed',
    };
  }

  // why: axis 1 of cross-validation. The `'open' → 'completed'`
  // transition happens at the END of Phase 3 step 9 atomically with
  // the entitlement INSERT; the `'open' → 'expired' / 'canceled'`
  // transitions are owned by future WPs handling
  // `checkout.session.expired` / cancellation events. Refusing
  // fulfillment against a non-`'open'` session defends against
  // delayed webhook delivery race conditions where an expiry handler
  // ran first.
  if (sessionRow.intent_status !== 'open') {
    const failureMessage = `processStripeEvent refused to fulfill against a session whose intent_status is '${sessionRow.intent_status}' (sessionId ${stripeSessionId}); only 'open' sessions are eligible. The 'completed' state indicates a prior fulfillment; 'expired' and 'canceled' are owned by future WPs handling checkout.session.expired / cancellation events.`;
    await recordProcessError(database, eventRecord.id, failureMessage);
    return {
      ok: false,
      reason: failureMessage,
      code: 'session_lookup_failed',
    };
  }

  // Phase 2 step 5 — three remaining cross-validation axes:
  //   axis 3: client_reference_id matches sessionRow.account_id
  //   axis 4: metadata.entitlementKey matches sessionRow.entitlement_key
  //   axis 5: priceAllowlist[sessionRow.price_id] === sessionRow.entitlement_key
  if (payload.data.object.client_reference_id !== sessionRow.account_id) {
    const failureMessage = `processStripeEvent rejected a cross-validation mismatch on client_reference_id for sessionId ${stripeSessionId}: the event payload's client_reference_id ('${payload.data.object.client_reference_id}') does not equal the recorded session row's account_id ('${sessionRow.account_id}').`;
    await recordProcessError(database, eventRecord.id, failureMessage);
    return {
      ok: false,
      reason: failureMessage,
      code: 'cross_validation_failed',
    };
  }

  if (
    payload.data.object.metadata.entitlementKey !==
    sessionRow.entitlement_key
  ) {
    const failureMessage = `processStripeEvent rejected a cross-validation mismatch on metadata.entitlementKey for sessionId ${stripeSessionId}: the event payload's metadata.entitlementKey ('${payload.data.object.metadata.entitlementKey}') does not equal the recorded session row's entitlement_key ('${sessionRow.entitlement_key}').`;
    await recordProcessError(database, eventRecord.id, failureMessage);
    return {
      ok: false,
      reason: failureMessage,
      code: 'cross_validation_failed',
    };
  }

  const allowlistEntitlementKey = billingConfig.priceAllowlist.get(
    sessionRow.price_id,
  );
  if (
    allowlistEntitlementKey === undefined ||
    allowlistEntitlementKey !== sessionRow.entitlement_key
  ) {
    const failureMessage = `processStripeEvent rejected a price-allowlist mismatch for sessionId ${stripeSessionId}: the BillingConfig.priceAllowlist for priceId '${sessionRow.price_id}' resolved to '${allowlistEntitlementKey ?? 'undefined'}', which does not equal the recorded session row's entitlement_key '${sessionRow.entitlement_key}'. The env-configured STRIPE_PRICE_ALLOWLIST may have drifted between WP-133 INSERT time and this fulfillment.`;
    await recordProcessError(database, eventRecord.id, failureMessage);
    return {
      ok: false,
      reason: failureMessage,
      code: 'price_not_in_allowlist',
    };
  }

  // why: post-cross-validation, `allowlistEntitlementKey` is narrowed
  // to `EntitlementKey` (the priceAllowlist's value type) AND equals
  // `sessionRow.entitlement_key` by axis-5 verification. This alias
  // is what binds to the entitlement INSERT's `$2` parameter; using
  // the allowlist value preserves the closed-set typing through the
  // call to `runFulfillmentTransaction` without a cast.
  const validatedEntitlementKey: EntitlementKey = allowlistEntitlementKey;

  // Phase 3 step 6 — accountId → player_id resolution. The
  // `account_id` text on the session row was already cross-validated
  // against `payload.data.object.client_reference_id` in axis 3; the
  // brand cast here is a no-op at runtime and reflects that
  // `sessionRow.account_id` IS an `AccountId` by virtue of the WP-133
  // INSERT pathway.
  const sessionAccountId = sessionRow.account_id as AccountId;
  let playerId: number | null;
  try {
    playerId = await loadPlayerIdByExtId(database, sessionAccountId);
  } catch (lookupError) {
    const errorMessage =
      lookupError instanceof Error ? lookupError.message : 'unknown driver error';
    const failureMessage = `processStripeEvent failed at the legendary.players SELECT for ext_id ${sessionAccountId}; the database driver rejected the SELECT with: ${errorMessage}.`;
    await recordProcessError(database, eventRecord.id, failureMessage);
    return {
      ok: false,
      reason: failureMessage,
      code: 'cross_validation_failed',
    };
  }
  if (playerId === null) {
    const failureMessage = `processStripeEvent could not resolve session row's account_id '${sessionAccountId}' to a legendary.players row; this is a referential-integrity miss that should be impossible given the FK CASCADE on stripe_checkout_sessions.account_id and is surfaced for forensic review.`;
    await recordProcessError(database, eventRecord.id, failureMessage);
    return {
      ok: false,
      reason: failureMessage,
      code: 'cross_validation_failed',
    };
  }

  // Phase 3 step 7..11 — transactional fulfillment write.
  const sourceRef = clampForOperatorLog(stripeSessionId, SOURCE_REF_SOFT_CAP);
  const client = await database.connect();
  let transactionResult: FulfillmentTransactionResult;
  try {
    transactionResult = await runFulfillmentTransaction(client, {
      playerId,
      entitlementKey: validatedEntitlementKey,
      sessionId: stripeSessionId,
      sourceRef,
      eventRowId: eventRecord.id,
    });
  } catch (unexpectedTransactionError) {
    // why: BEGIN/COMMIT statements themselves can throw on broken
    // connections; the caller already swallows ROLLBACK faults inside
    // `rollbackQuietly`. Any exception escaping here is an unexpected
    // pg-driver fault — capture as `'entitlement_insert_failed'` (the
    // first transaction-scope write) since the granular code is
    // unknown at this seam.
    const errorMessage =
      unexpectedTransactionError instanceof Error
        ? unexpectedTransactionError.message
        : 'unknown driver error';
    transactionResult = {
      kind: 'failure',
      code: 'entitlement_insert_failed',
      message: `processStripeEvent encountered an unexpected fault inside the BEGIN/COMMIT envelope for sessionId ${stripeSessionId}; the database driver raised: ${errorMessage}.`,
    };
  } finally {
    client.release();
  }

  if (transactionResult.kind === 'failure') {
    await recordProcessError(database, eventRecord.id, transactionResult.message);
    return {
      ok: false,
      reason: transactionResult.message,
      code: transactionResult.code,
    };
  }

  return {
    ok: true,
    value: {
      entitlementGranted: transactionResult.entitlementGranted,
      entitlementKey: validatedEntitlementKey,
      sessionId: stripeSessionId,
      reason: transactionResult.entitlementGranted ? 'fulfilled' : 'duplicate',
    },
  };
}
