/**
 * Analytics HTTP Routes — Server Layer (WP-205 / EC-233)
 *
 * Registers four HTTP endpoints on the existing Koa router returned
 * by boardgame.io's `Server({...})` instance:
 *
 *   * `POST /api/analytics/events` — `guest`; accepts single
 *     `AnalyticsEventCapturePayload` OR batch
 *     `AnalyticsEventBatchPayload` (≤50 events; ≤100 KB batch;
 *     ≤8 KB single). Per-IP rate limit (60 EVENTS/min via in-memory
 *     token bucket — NOT 60 requests; batch of N consumes N tokens
 *     per D-20503 tightening). Hashes `user_id` at the route
 *     boundary BEFORE any INSERT per D-20502. Status-code domain
 *     `{202, 400, 413, 429, 500}`. Response body on 202 is
 *     `{ accepted: number }`.
 *
 *   * `GET /api/analytics/traffic-sources?range=...` —
 *     `authenticated-session-required`; closed `range` ∈
 *     `'7d'|'14d'|'30d'|'90d'`. Status-code domain
 *     `{200, 400, 401, 500}`. Response body on 200 is
 *     `{ data: readonly TrafficSource[] }`.
 *
 *   * `GET /api/analytics/activation-funnel?range=...` — same shape;
 *     returns `{ data: readonly ActivationFunnelStep[] }`.
 *
 *   * `GET /api/analytics/retention-cohorts?cohortCount=...` —
 *     `authenticated-session-required`; integer `[1, 26]`; default
 *     8. Returns `{ data: readonly RetentionCohort[] }`.
 *
 * Mirrors the WP-133 / EC-136 billing routes structural shape: local
 * `KoaRouter` / `KoaContext` interfaces (no direct `@koa/router`
 * import), caller-injected `AnalyticsRouteDependencies`,
 * `Cache-Control: no-store` as the FIRST statement of every handler
 * body per D-11504 (applies to happy paths AND error paths). Status-
 * code domains locked per handler; envelope split locked per
 * D-20503 (server bare `{ data: T[] }` for 3 GETs; the dashboard's
 * future LIVE-flip wrapper adds `source` / `updatedAt` at the call
 * site).
 *
 * Layer-boundary contract: imports only `./analytics.types.js`,
 * `./analytics.logic.js`, `./userIdHash.js`, and the auth-layer
 * `SessionTokenRequest` / `SessionVerifier` / `AccountResolver` /
 * `RequireAuthenticatedSessionOptions` types. No `boardgame.io`,
 * no `@legendary-arena/(game-engine|registry|preplan)`, no
 * `apps/dashboard/**`.
 *
 * Authority: WP-205 §Scope (In) → Server module §E; EC-233
 * §Execution Order Sub-task C + §After Completing → Sub-task C
 * close; D-20501 (schema + closed-set 3-layer enforcement +
 * channel attribution + retention v1 coarse + properties JSON-
 * serializability invariant + INSERT discipline + SQL pre-sorted +
 * request validation rules); D-20502 (PII posture — hashing at
 * route boundary; raw `user_id` never logged or echoed in 4xx
 * bodies); D-20503 (auth posture split + envelope shape + rate
 * limit per-event + idempotency NOT idempotent); D-11504
 * (Cache-Control first-statement lock); D-10403 (auth code
 * collapse to `'unauthorized'`).
 */

import type {
  ACQUISITION_EVENT_TYPES,
  AcquisitionEventType,
  ActivationFunnelStep,
  DateRange,
  RetentionCohort,
  TrafficSource,
} from './analytics.types.js';
import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';
import {
  ACQUISITION_EVENT_TYPES as ACQUISITION_EVENT_TYPES_VALUE,
} from './analytics.types.js';
import type {
  AnalyticsEventRow,
  DatabaseClient,
} from './analytics.logic.js';
import {
  getActivationFunnel,
  getRetentionCohorts,
  getTrafficSources,
  insertAnalyticsEvent,
  insertAnalyticsEventBatch,
} from './analytics.logic.js';
import { hashUserId } from './userIdHash.js';

/**
 * Closed-set re-statement of the orchestrator's
 * `Result<AccountId, SessionValidationErrorCode>` shape. Declared
 * locally per the WP-104 / WP-132 / WP-133 precedent (this file
 * does not import from `../identity/identity.types.js`).
 */
type AccountId = string & { readonly __brand: 'AccountId' };

type SessionValidationCode =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'unknown_account'
  | 'session_verifier_not_configured'
  | 'lookup_failed';

type RequireAuthenticatedSessionResult =
  | { ok: true; value: AccountId }
  | { ok: false; reason: string; code: SessionValidationCode };

/**
 * Caller-injected dependency bundle for `registerAnalyticsRoutes`.
 * Mirrors the WP-133 `BillingRouteDependencies` shape verbatim with
 * one analytics-specific addition: `analyticsUserIdSalt`, loaded
 * once at server startup via `getAnalyticsUserIdSalt()` and threaded
 * here. Optional `now` factory permits deterministic
 * `currentServerTime` injection in tests (production callers omit;
 * the default returns `Date.now()` at validator entry).
 */
export interface AnalyticsRouteDependencies {
  readonly requireAuthenticatedSession: (
    req: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<RequireAuthenticatedSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
  readonly analyticsUserIdSalt: string;
  readonly now?: () => number;
  readonly rateLimitCapacity?: number;
}

interface KoaAnalyticsRequest extends SessionTokenRequest {
  body?: unknown;
  ip?: string;
  query?: Readonly<Record<string, string | string[] | undefined>>;
}

interface KoaAnalyticsContext {
  request: KoaAnalyticsRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

interface KoaRouter {
  post(
    path: string,
    handler: (koaContext: KoaAnalyticsContext) => Promise<void> | void,
  ): unknown;
  get(
    path: string,
    handler: (koaContext: KoaAnalyticsContext) => Promise<void> | void,
  ): unknown;
}

// why: D-20503 — per-IP token bucket capacity (60 events per 60s
// per IP). Locked default; overridable via deps for tests that
// exercise the at-limit branch without seeding 60 fixture events.
// Capacity is on EVENTS, not REQUESTS (a batch of N consumes N
// tokens per the D-20503 tightening — batching cannot bypass the
// limit).
const DEFAULT_RATE_LIMIT_CAPACITY = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

// why: D-20503 — body caps for the always-open `guest` POST
// endpoint. Single-event payloads ≤ 8 KB; batch payloads ≤ 100 KB
// AND ≤ 50 events. Defense for the always-open posture.
const SINGLE_BODY_CAP_BYTES = 8 * 1024;
const BATCH_BODY_CAP_BYTES = 100 * 1024;
const BATCH_MAX_EVENTS = 50;

// why: D-20501 — length bounds enforced at the validator BEFORE
// the INSERT / hashing. `session_id` non-empty ≤ 128 chars;
// `user_id` ≤ 512 chars pre-hash. Empty session_id rejected;
// over-length user_id rejected WITHOUT calling hashUserId(...).
const MAX_SESSION_ID_LENGTH = 128;
const MAX_USER_ID_LENGTH = 512;

// why: D-20501 — `properties` nesting depth ≤ 5 (root object =
// level 0; arrays count as one level). Defense against deeply-
// nested abusive payloads.
const MAX_PROPERTIES_DEPTH = 5;

// why: D-20503 — `timestamp` 5-minute future tolerance for client
// clock drift. The validator captures `currentServerTime` ONCE
// per request as the upper-bound anchor; INSERTed `ts` is the
// client-supplied value, not the server clock.
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

// why: D-20503 — retention cohortCount bounds. Default 8 if
// absent; range 1-26 (about 6 months of weekly cohorts at the
// upper bound). Values outside this range → 400.
const DEFAULT_COHORT_COUNT = 8;
const MAX_COHORT_COUNT = 26;

// why: D-20503 — closed-set DateRange union. Adding a 5th value
// requires updating both this set and the server-local
// `DateRange` union in `analytics.types.ts`.
const VALID_RANGES: ReadonlySet<DateRange> = new Set<DateRange>([
  '7d',
  '14d',
  '30d',
  '90d',
]);

// why: type-narrowing helper — runtime check that a string is a
// member of `ACQUISITION_EVENT_TYPES`. The Set is built once at
// module load; the runtime check supports the route validator's
// closed-set rejection at request time (3-layer enforcement per
// D-20501).
const ACQUISITION_EVENT_TYPES_SET: ReadonlySet<string> = new Set(
  ACQUISITION_EVENT_TYPES_VALUE,
);
function isAcquisitionEventType(value: unknown): value is AcquisitionEventType {
  return typeof value === 'string' && ACQUISITION_EVENT_TYPES_SET.has(value);
}

// why: D-20501 — `properties` leaf-type rule. The JSONB column
// preserves only JSON-spec primitive types; reject at the
// validator to prevent silent coercion (e.g., Date → string via
// toJSON()). Forbidden: Date, undefined, Map, Set, Function,
// class instances (anything that doesn't pass the "plain object
// or array literal" structural check), BigInt, Symbol.
function isJsonPrimitiveLeaf(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean';
}

// why: D-20501 — only "plain" objects (constructed via `{}` or
// `Object.create(null)`) are allowed at non-leaf positions; class
// instances, Maps, Sets, etc. are FORBIDDEN. The `Object` /
// `null` prototype check rejects class instances while accepting
// the literal object cases.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Validates a `properties` value against the locked rules:
 *
 *   - Optional (absent allowed; absent treated as `{}`).
 *   - Root MUST be a plain object (NOT an array — D-20501).
 *   - Nesting depth ≤ 5 (root = level 0; arrays count as one
 *     level — D-20501).
 *   - Leaf values are `string | number | boolean | null` only;
 *     forbidden: `Date`, `undefined`, `Map`, `Set`, `Function`,
 *     class instances, BigInt, Symbol (D-20501).
 *
 * Returns `true` if the structure passes; `false` otherwise. The
 * caller maps `false` → 400 `'invalid_request'`.
 */
function isValidProperties(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (Array.isArray(value)) {
    // why: D-20501 — arrays at root are FORBIDDEN. The root must
    // be an object so future per-event-type metadata has a stable
    // key surface.
    return false;
  }
  if (isPlainObject(value) === false) {
    return false;
  }
  // why: D-20501 — bounded-depth walker. `level` is the nesting
  // count from root (root object = 0). Arrays inside the object
  // contribute one additional level each (so an array-of-arrays
  // 3-deep at root contributes 3 levels). Forbidden types short-
  // circuit the walk to `false`. Plain objects + arrays are
  // recursed into; primitive leaves accepted.
  function walk(node: unknown, level: number): boolean {
    if (level > MAX_PROPERTIES_DEPTH) {
      return false;
    }
    if (isJsonPrimitiveLeaf(node)) {
      return true;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        if (walk(item, level + 1) === false) {
          return false;
        }
      }
      return true;
    }
    if (isPlainObject(node)) {
      for (const item of Object.values(node)) {
        if (walk(item, level + 1) === false) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  return walk(value, 0);
}

/**
 * Validates a single `AnalyticsEventCapturePayload` shape. Returns
 * the typed payload on success; `null` on failure. The caller maps
 * `null` → 400 `'invalid_request'`.
 *
 * Validation order (D-20503 — length checks BEFORE hashing):
 *   1. `event_type` ∈ `ACQUISITION_EVENT_TYPES`.
 *   2. `session_id` non-empty + ≤ 128 chars.
 *   3. `timestamp` finite number ∈ `[0, currentServerTime + 5min]`.
 *   4. `user_id` `string | null`; non-null ≤ 512 chars (pre-hash).
 *   5. `properties` optional; depth ≤ 5; leaf types valid; root
 *      object only.
 */
interface ValidatedPayload {
  readonly event_type: AcquisitionEventType;
  readonly user_id: string | null;
  readonly session_id: string;
  readonly timestamp: number;
  readonly properties: Readonly<Record<string, unknown>>;
}

function validatePayload(
  value: unknown,
  currentServerTime: number,
): ValidatedPayload | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (isAcquisitionEventType(record.event_type) === false) {
    return null;
  }
  if (typeof record.session_id !== 'string') {
    return null;
  }
  if (record.session_id.length === 0 || record.session_id.length > MAX_SESSION_ID_LENGTH) {
    return null;
  }
  if (typeof record.timestamp !== 'number' || Number.isFinite(record.timestamp) === false) {
    return null;
  }
  if (record.timestamp < 0 || record.timestamp > currentServerTime + FUTURE_TIMESTAMP_TOLERANCE_MS) {
    return null;
  }
  if (record.user_id !== null && typeof record.user_id !== 'string') {
    return null;
  }
  if (typeof record.user_id === 'string' && record.user_id.length > MAX_USER_ID_LENGTH) {
    return null;
  }
  if (isValidProperties(record.properties) === false) {
    return null;
  }
  const properties = (record.properties === undefined ? {} : record.properties) as Readonly<Record<string, unknown>>;
  return {
    event_type: record.event_type,
    user_id: record.user_id as string | null,
    session_id: record.session_id,
    timestamp: record.timestamp,
    properties,
  };
}

// why: D-20503 — per-IP token bucket lifecycle. Buckets refill
// linearly within the 60s window. Process-local state (Map<string,
// BucketState>); multi-instance deployments share no state. A
// future redis-backed limiter is a hardening WP if/when
// multi-instance lands. Documented inline here so a reader doesn't
// accidentally rely on cross-instance enforcement.
interface BucketState {
  tokens: number;
  lastRefill: number;
}

function makeRateLimiter(capacity: number, now: () => number): {
  consume: (ip: string, count: number) => boolean;
} {
  const buckets = new Map<string, BucketState>();
  return {
    consume(ip, count) {
      const currentTime = now();
      const existing = buckets.get(ip);
      let state: BucketState;
      if (existing === undefined) {
        state = { tokens: capacity, lastRefill: currentTime };
        buckets.set(ip, state);
      } else {
        state = existing;
        const elapsed = currentTime - state.lastRefill;
        if (elapsed >= RATE_LIMIT_WINDOW_MS) {
          // why: full refill once the window has expired; the
          // bucket effectively resets to capacity. Linear refill
          // within a sub-window is intentionally NOT implemented
          // — the simpler whole-window reset matches the
          // "60/min" mental model and is harder to game with
          // burst patterns.
          state.tokens = capacity;
          state.lastRefill = currentTime;
        }
      }
      if (state.tokens < count) {
        return false;
      }
      state.tokens = state.tokens - count;
      return true;
    },
  };
}

// why: D-10403 — dispatch closed-set SessionValidationCode values
// to the locked HTTP status. 'unknown_account' returns 401 (NOT
// 403) per the account-existence-probe defense. All 4 401-mapped
// codes collapse to a single client-facing 'unauthorized' value
// (the 'session_verifier_not_configured' / 'lookup_failed' codes
// map to 500 because they are operator-facing — production wiring
// problems, not request-side issues).
function statusForSessionValidationCode(code: SessionValidationCode): number {
  if (code === 'session_verifier_not_configured' || code === 'lookup_failed') {
    return 500;
  }
  return 401;
}

/**
 * Register the four analytics routes on the supplied Koa router.
 * The router is mutated in place; the function returns `void`.
 */
export function registerAnalyticsRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: AnalyticsRouteDependencies,
): void {
  const now = deps.now ?? (() => Date.now());
  const rateLimiter = makeRateLimiter(
    deps.rateLimitCapacity ?? DEFAULT_RATE_LIMIT_CAPACITY,
    now,
  );

  router.post('/api/analytics/events', async (koaContext) => {
    // why: D-11504 — Cache-Control MUST be the literal first
    // statement of every handler body so a thrown exception still
    // leaves the header set on the eventual 500 response.
    koaContext.set('Cache-Control', 'no-store');
    try {
      // why: D-20503 — `guest` auth posture. Pre-signup visitors
      // have no session token; gating capture would discard the
      // entire pre-signup attribution surface. The rate limit +
      // body cap are the always-open defenses.
      const requestIp = typeof koaContext.request.ip === 'string' ? koaContext.request.ip : 'unknown';
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_request' };
        return;
      }
      // why: D-20503 — body size cap; reject BEFORE parsing /
      // hashing / INSERT. Single-event ≤ 8 KB; batch ≤ 100 KB.
      // The size measurement uses JSON.stringify length (UTF-16
      // code units), which is a close-enough proxy for the byte
      // size at the application layer; Koa's body-parser is the
      // upstream defense at the network layer.
      const isBatch = Array.isArray((rawBody as Record<string, unknown>).events);
      // why: D-20503 — body size cap via JSON.stringify length. If
      // the body contains values that cannot be serialized to JSON
      // (BigInt, Symbol, Function), JSON.stringify throws — those
      // are also `properties` leaf-type violations per D-20501, so
      // treating the serialization failure as a 400 'invalid_request'
      // collapses both paths into the same response shape (field-
      // NAME error per D-20502 leakage gate).
      let bodyLength: number;
      try {
        bodyLength = JSON.stringify(rawBody).length;
      } catch {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_request' };
        return;
      }
      if (isBatch === false && bodyLength > SINGLE_BODY_CAP_BYTES) {
        koaContext.status = 413;
        koaContext.body = { code: 'payload_too_large' };
        return;
      }
      if (isBatch === true && bodyLength > BATCH_BODY_CAP_BYTES) {
        koaContext.status = 413;
        koaContext.body = { code: 'payload_too_large' };
        return;
      }
      const eventsToProcess: unknown[] = isBatch === true
        ? ((rawBody as { events: unknown[] }).events)
        : [rawBody];
      if (isBatch === true && eventsToProcess.length > BATCH_MAX_EVENTS) {
        koaContext.status = 413;
        koaContext.body = { code: 'payload_too_large' };
        return;
      }
      if (eventsToProcess.length === 0) {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_request' };
        return;
      }
      // why: D-20503 — rate limit consumed BEFORE any parsing /
      // hashing / INSERT. Bucket capacity is on EVENTS (a batch
      // of N consumes N tokens); insufficient tokens reject the
      // FULL batch with 429 (no partial accept). The full payload
      // is dropped — no rows inserted.
      const eventCount = eventsToProcess.length;
      if (rateLimiter.consume(requestIp, eventCount) === false) {
        koaContext.status = 429;
        koaContext.body = { code: 'rate_limited' };
        return;
      }
      // why: D-20503 — capture `currentServerTime` ONCE per
      // request at validator entry as the upper-bound anchor.
      // The validator MUST NOT call `now()` multiple times per
      // request (flakiness vector). INSERTed `ts` is the client-
      // supplied value, not the server clock.
      const currentServerTime = now();
      const validatedRows: AnalyticsEventRow[] = [];
      for (const candidate of eventsToProcess) {
        const validated = validatePayload(candidate, currentServerTime);
        if (validated === null) {
          // why: D-20503 — full-batch-or-nothing semantics; even
          // partial-validation failure rejects the whole batch.
          // Error response uses field-NAME messaging only per
          // D-20502 leakage gate; the raw user_id (if any) does
          // NOT appear in the response body.
          koaContext.status = 400;
          koaContext.body = { code: 'invalid_request' };
          return;
        }
        // why: D-20502 — hashUserId(payload.user_id, salt) is
        // called at the route boundary AFTER length-bound
        // validation BEFORE any INSERT. Raw user_id NEVER reaches
        // the persistence layer in cleartext.
        const userIdHash = hashUserId(validated.user_id, deps.analyticsUserIdSalt);
        validatedRows.push({
          eventType: validated.event_type,
          userIdHash,
          sessionId: validated.session_id,
          timestamp: validated.timestamp,
          properties: validated.properties,
        });
      }
      // why: D-20503 — capture endpoint is NOT idempotent;
      // duplicate POST submissions produce duplicate rows. The
      // server applies no UNIQUE constraint beyond `id`; no
      // INSERT ... ON CONFLICT; no clock-window dedupe. Clients
      // own deduplication if required.
      if (validatedRows.length === 1) {
        await insertAnalyticsEvent(database, validatedRows[0]!);
      } else {
        await insertAnalyticsEventBatch(database, validatedRows);
      }
      koaContext.status = 202;
      koaContext.body = { accepted: validatedRows.length };
    } catch (caughtError) {
      // why: never re-throw to a global Koa handler — the 500
      // envelope is locked at `{ code: 'internal_error' }` per
      // D-11802 = (C). The caught value is intentionally
      // discarded; D-20502 leakage gate forbids echoing the
      // raw user_id (which might appear in a thrown SQL error
      // string) to the response body.
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { code: 'internal_error' };
    }
  });

  router.get('/api/analytics/traffic-sources', async (koaContext) => {
    // why: D-11504 — Cache-Control MUST be the literal first
    // statement of every handler body, including error paths.
    koaContext.set('Cache-Control', 'no-store');
    try {
      // why: D-20503 — `authenticated-session-required` posture.
      // 'missing_token' / 'invalid_token' / 'expired_token' /
      // 'unknown_account' collapse to a single 'unauthorized'
      // value per D-10403 account-existence-probe defense.
      const sessionResult = await deps.requireAuthenticatedSession(
        koaContext.request,
        {
          verifier: deps.verifier,
          accountResolver: deps.accountResolver,
          database: database as unknown as RequireAuthenticatedSessionOptions['database'],
        },
      );
      if (sessionResult.ok === false) {
        const status = statusForSessionValidationCode(sessionResult.code);
        koaContext.status = status;
        if (status === 401) {
          koaContext.body = { code: 'unauthorized' };
        } else {
          koaContext.body = { code: 'internal_error' };
        }
        return;
      }
      const range = readRangeParam(koaContext.request.query);
      if (range === null) {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_request' };
        return;
      }
      // why: D-20501 SQL pre-sorted invariant — the result is
      // returned DIRECTLY from the logic layer's SQL `ORDER BY
      // channel ASC, date ASC` output. The route handler MUST
      // NOT call `Array.sort(...)`; SQL is authoritative.
      const data: readonly TrafficSource[] = await getTrafficSources(database, range);
      // why: D-20503 — bare `{ data: T[] }` envelope. No
      // `source` / `updatedAt` fields. The dashboard's future
      // LIVE-flip wrapper adds those at the call site.
      koaContext.status = 200;
      koaContext.body = { data };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { code: 'internal_error' };
    }
  });

  router.get('/api/analytics/activation-funnel', async (koaContext) => {
    // why: D-11504 — Cache-Control first-statement lock.
    koaContext.set('Cache-Control', 'no-store');
    try {
      const sessionResult = await deps.requireAuthenticatedSession(
        koaContext.request,
        {
          verifier: deps.verifier,
          accountResolver: deps.accountResolver,
          database: database as unknown as RequireAuthenticatedSessionOptions['database'],
        },
      );
      if (sessionResult.ok === false) {
        const status = statusForSessionValidationCode(sessionResult.code);
        koaContext.status = status;
        if (status === 401) {
          koaContext.body = { code: 'unauthorized' };
        } else {
          koaContext.body = { code: 'internal_error' };
        }
        return;
      }
      const range = readRangeParam(koaContext.request.query);
      if (range === null) {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_request' };
        return;
      }
      // why: D-20501 SQL pre-sorted invariant — SQL `ORDER BY
      // step ASC, date ASC` is authoritative; route MUST NOT
      // re-sort.
      const data: readonly ActivationFunnelStep[] = await getActivationFunnel(database, range);
      koaContext.status = 200;
      koaContext.body = { data };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { code: 'internal_error' };
    }
  });

  router.get('/api/analytics/retention-cohorts', async (koaContext) => {
    // why: D-11504 — Cache-Control first-statement lock.
    koaContext.set('Cache-Control', 'no-store');
    try {
      const sessionResult = await deps.requireAuthenticatedSession(
        koaContext.request,
        {
          verifier: deps.verifier,
          accountResolver: deps.accountResolver,
          database: database as unknown as RequireAuthenticatedSessionOptions['database'],
        },
      );
      if (sessionResult.ok === false) {
        const status = statusForSessionValidationCode(sessionResult.code);
        koaContext.status = status;
        if (status === 401) {
          koaContext.body = { code: 'unauthorized' };
        } else {
          koaContext.body = { code: 'internal_error' };
        }
        return;
      }
      const cohortCount = readCohortCountParam(koaContext.request.query);
      if (cohortCount === null) {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_request' };
        return;
      }
      // why: D-20501 SQL pre-sorted invariant — SQL `ORDER BY
      // cohort_week ASC` is authoritative; route MUST NOT re-sort.
      const data: readonly RetentionCohort[] = await getRetentionCohorts(database, cohortCount);
      koaContext.status = 200;
      koaContext.body = { data };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { code: 'internal_error' };
    }
  });
}

// why: query-param reader for the closed `DateRange` union; rejects
// arrays (Koa exposes repeated params as arrays — accept only
// arrays of length 1 per the WP-115 v1.1 Patch 5 precedent).
// Returns `null` for any invalid input; the caller maps `null` →
// 400 `'invalid_request'`.
function readRangeParam(
  query: Readonly<Record<string, string | string[] | undefined>> | undefined,
): DateRange | null {
  if (query === undefined) {
    return null;
  }
  const rawValue = query.range;
  let stringValue: string | undefined;
  if (typeof rawValue === 'string') {
    stringValue = rawValue;
  } else if (Array.isArray(rawValue) && rawValue.length === 1) {
    stringValue = rawValue[0];
  } else {
    return null;
  }
  if (stringValue === undefined) {
    return null;
  }
  if (VALID_RANGES.has(stringValue as DateRange) === false) {
    return null;
  }
  return stringValue as DateRange;
}

// why: query-param reader for `cohortCount`. Default 8 if absent;
// must be a positive integer in [1, 26]. Mirrors the limit/offset
// validation discipline from WP-115 leaderboard routes.
function readCohortCountParam(
  query: Readonly<Record<string, string | string[] | undefined>> | undefined,
): number | null {
  if (query === undefined) {
    return DEFAULT_COHORT_COUNT;
  }
  const rawValue = query.cohortCount;
  if (rawValue === undefined) {
    return DEFAULT_COHORT_COUNT;
  }
  let stringValue: string | undefined;
  if (typeof rawValue === 'string') {
    stringValue = rawValue;
  } else if (Array.isArray(rawValue) && rawValue.length === 1) {
    stringValue = rawValue[0];
  } else {
    return null;
  }
  if (stringValue === undefined) {
    return null;
  }
  const parsed = Number(stringValue);
  if (Number.isFinite(parsed) === false || Number.isInteger(parsed) === false) {
    return null;
  }
  if (parsed < 1 || parsed > MAX_COHORT_COUNT) {
    return null;
  }
  return parsed;
}

// why: re-export for tests / external consumers. Suppresses
// the "unused import" warning on the value-mode
// `ACQUISITION_EVENT_TYPES` (used here at module load time to
// build the runtime guard set). The type-mode import is preserved
// for downstream callers that need the type alone.
export type { ACQUISITION_EVENT_TYPES };
