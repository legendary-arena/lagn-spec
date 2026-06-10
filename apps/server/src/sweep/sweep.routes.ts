/**
 * Sweep HTTP Routes — Server Layer (WP-209 / EC-241)
 *
 * Registers two HTTP endpoints on the existing Koa router returned by
 * boardgame.io's `Server({...})` instance:
 *
 *   * `POST /api/sweep/runs` — `guest` per D-9905 with shared-secret header
 *     auth (`X-Sweep-Token` byte-compared in constant time via the shared
 *     `validateSharedSecret` helper). Persists one row
 *     to `legendary.sweep_runs` via `insertSweepRun`. Idempotent by `run_id`
 *     PRIMARY KEY: duplicate submissions return 409 with the existing row
 *     UNCHANGED (no UPSERT semantics per D-20701). Status-code domain
 *     `{201, 400, 401, 409, 413, 500}`.
 *
 *   * `GET /api/sweep/latest` — `authenticated-session-required` per D-9905;
 *     `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403
 *     carry-forward. Returns the locked envelope
 *     `{ data: { latest: SweepRunSummary | null, recentRuns: readonly
 *     SweepRunSummary[] } }` — intentional `data: object` deviation from the
 *     WP-205 `data: readonly T[]` shape because two semantically distinct
 *     payloads ship in one response. Ignores all query parameters in v1.
 *     Status-code domain `{200, 401, 500}`.
 *
 * Mirrors the WP-205 analytics.routes.ts structural shape: local `KoaRouter` /
 * `KoaContext` interfaces (no direct `@koa/router` import), caller-injected
 * `SweepRouteDependencies`, `Cache-Control: no-store` as the FIRST statement
 * of every handler body per D-11504 (applies to happy paths AND error paths).
 *
 * Layer-boundary contract: imports only `./sweep.types.js`, `./sweep.logic.js`,
 * the auth-layer `SessionTokenRequest` / `SessionVerifier` / `AccountResolver`
 * / `RequireAuthenticatedSessionOptions` types, and the shared
 * `../auth/validateSharedSecret.js` helper for the constant-time secret check.
 * No `boardgame.io`, no `@legendary-arena/(registry|preplan)`,
 * no `apps/dashboard/**`. `SweepAnomalyClass` + `SWEEP_ANOMALY_CLASSES` come
 * from `./sweep.types.js` which re-exports them from
 * `@legendary-arena/game-engine` (single source of truth).
 *
 * Authority: WP-209 §Locked Type Contracts + §Non-Negotiable Constraints +
 * §Acceptance Criteria; EC-241 §Locked Values + §Guardrails + §Required
 * `// why:` Comments; D-20701 (storage shape lock); D-20702 (auth posture);
 * D-11504 (Cache-Control first-statement lock); D-10403 (auth code collapse
 * to `'unauthorized'`).
 */

import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';
import { validateSharedSecret } from '../auth/validateSharedSecret.js';
import type { DatabaseClient, SweepRunWithBlob } from './sweep.logic.js';
import {
  SweepRunDuplicateError,
  fetchLatestSweepRunWithBlob,
  fetchRecentSweepRuns,
  insertSweepRun,
} from './sweep.logic.js';
import type {
  SweepAnomalyClass,
  SweepRunPayload,
  SweepRunSummary,
} from './sweep.types.js';
import { SWEEP_ANOMALY_CLASSES } from './sweep.types.js';

/**
 * Closed-set re-statement of the orchestrator's
 * `Result<AccountId, SessionValidationErrorCode>` shape. Declared locally per
 * the WP-104 / WP-132 / WP-133 / WP-205 precedent (this file does not import
 * from `../identity/identity.types.js`).
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
 * Caller-injected dependency bundle for `registerSweepRoutes`. Mirrors the
 * WP-205 `AnalyticsRouteDependencies` shape with one sweep-specific addition
 * (`sweepSubmitToken`) and the analytics-specific salt removed (no PII
 * hashing on the sweep surface). The token is loaded once at server startup
 * via the `SWEEP_SUBMIT_TOKEN` env var (production loud-fail on missing per
 * D-20702 mirroring `ANALYTICS_USER_ID_SALT`).
 */
export interface SweepRouteDependencies {
  readonly requireAuthenticatedSession: (
    request: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<RequireAuthenticatedSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
  readonly sweepSubmitToken: string;
}

interface KoaSweepRequest extends SessionTokenRequest {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Readonly<Record<string, string | string[] | undefined>>;
}

interface KoaSweepContext {
  request: KoaSweepRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

interface KoaRouter {
  post(
    path: string,
    handler: (koaContext: KoaSweepContext) => Promise<void> | void,
  ): unknown;
  get(
    path: string,
    handler: (koaContext: KoaSweepContext) => Promise<void> | void,
  ): unknown;
}

// why: D-20701 — POST body size cap (5 MB). Raw `ManifestClassification`
// blobs can be large; cell counts at full Scheme × Mastermind cross-product
// land around 200-500 cells with 4 KB per classified record = ~2 MB; 5 MB
// ceiling carries a 1 MB safety margin above the worst-case nightly payload.
// The validator measures via `JSON.stringify(rawBody).length` (UTF-16 code
// units) before any DB I/O.
const POST_BODY_SIZE_CAP_BYTES = 5 * 1024 * 1024;

// why: D-20701 — cell-count cap (10000). Defense-in-depth against malformed
// payloads; the DB CHECK constraint `(cell_count >= 0 AND cell_count <= 10000)`
// is the backstop, but the validator rejects with 413 BEFORE the INSERT so
// the route never spends a DB round-trip on a known-bad payload.
const POST_CELL_COUNT_CAP = 10000;

// why: D-20701 — runId length bound (128 chars). Matches the upstream sweep
// runner's `/^[A-Za-z0-9._-]+$/` shape at `scripts/sweep-setup-matrix.mjs:148`
// (the submission-side runId format `<shortSha>-<isoTimestampUtc>` produces
// strings under 30 chars in practice; the 128 ceiling carries a 4× safety
// margin for future runId schema evolution).
const RUN_ID_MAX_LENGTH = 128;

// why (D-20702): closed-set of POST failure-response shapes. The route
// handler maps every failure to one of these envelopes per the WP-209
// §Non-Negotiable Constraints lock; client-facing error strings carry no
// stack traces, no SQL fragments, no operator-only context.
const POST_FAILURE_ENVELOPES = {
  unauthorized: { data: [], error: 'unauthorized' as const },
  invalidRequest: { data: [], error: 'invalid_request' as const },
  payloadTooLarge: { data: [], error: 'payload_too_large' as const },
  conflict: { data: [], error: 'conflict' as const },
  internalError: { data: [], error: 'internal_error' as const },
} as const;

// why: GET failure-response envelopes. The locked GET status domain is
// `{200, 401, 500}` per the WP-209 §Non-Negotiable Constraints; no 400 / 403
// / 404 path is reachable in v1 because the handler ignores all query
// parameters and the only auth state is "session valid" or "session invalid".
const GET_FAILURE_ENVELOPES = {
  unauthorized: { data: [], error: 'unauthorized' as const },
  internalError: { data: [], error: 'internal_error' as const },
} as const;

// why (D-19502 carry-forward): the closed taxonomy set built once at module
// load. Used by the validator to reject `anomalyCounts` objects whose keys
// fall outside the engine's canonical 4-class set. A drift test in
// `sweep.routes.test.ts` asserts this set matches `SWEEP_ANOMALY_CLASSES`
// byte-identical.
const SWEEP_ANOMALY_CLASSES_SET: ReadonlySet<string> = new Set(
  SWEEP_ANOMALY_CLASSES,
);

// why (D-10403 carry-forward): dispatch closed-set SessionValidationCode
// values to the locked HTTP status. Four 401-mapped codes collapse to a
// single client-facing 'unauthorized' value (account-existence-probe defense).
// `session_verifier_not_configured` + `lookup_failed` map to 500 because they
// are operator-facing — production wiring problems, not request-side issues.
function statusForSessionValidationCode(code: SessionValidationCode): number {
  if (code === 'session_verifier_not_configured' || code === 'lookup_failed') {
    return 500;
  }
  return 401;
}

/**
 * Reads the `X-Sweep-Token` header value from the request. Koa lowercases
 * header names; this helper checks the canonical lowercase key. Returns the
 * string value when present and a single string (NOT an array — duplicate
 * headers are an obvious-malformed request), `null` otherwise.
 */
function readSweepTokenHeader(request: KoaSweepRequest): string | null {
  const headers = request.headers;
  if (headers === undefined || headers === null) {
    return null;
  }
  const rawValue = headers['x-sweep-token'];
  if (typeof rawValue === 'string' && rawValue.length > 0) {
    return rawValue;
  }
  return null;
}

/**
 * Validates a POST request body against the locked `SweepRunPayload` shape
 * per the WP-209 §Locked Type Contracts validator failure-mode table.
 * Returns a tagged result so the caller maps each failure to its locked
 * status code:
 *
 *   - `{ ok: true, payload }` — all checks passed; ready for INSERT.
 *   - `{ ok: false, status: 400, code: 'invalid_request' }` — runId /
 *     startedAt / anomalyCounts shape violation.
 *   - `{ ok: false, status: 413, code: 'payload_too_large' }` — cellCount
 *     exceeds the 10000 cap (defense-in-depth before INSERT).
 *
 * The 413 body-size check happens BEFORE this validator runs; this function
 * does not re-measure the raw body length.
 */
type PayloadValidationResult =
  | { ok: true; payload: SweepRunPayload }
  | { ok: false; status: 400; envelope: typeof POST_FAILURE_ENVELOPES.invalidRequest }
  | { ok: false; status: 413; envelope: typeof POST_FAILURE_ENVELOPES.payloadTooLarge };

function validateSweepRunPayload(rawBody: unknown): PayloadValidationResult {
  if (rawBody === null || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, status: 400, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const record = rawBody as Record<string, unknown>;
  if (
    typeof record.runId !== 'string' ||
    record.runId.length === 0 ||
    record.runId.length > RUN_ID_MAX_LENGTH
  ) {
    return { ok: false, status: 400, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  if (typeof record.startedAt !== 'string' || record.startedAt.length === 0) {
    return { ok: false, status: 400, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const startedAtDate = new Date(record.startedAt);
  if (Number.isNaN(startedAtDate.getTime())) {
    return { ok: false, status: 400, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  if (
    typeof record.cellCount !== 'number' ||
    Number.isFinite(record.cellCount) === false ||
    Number.isInteger(record.cellCount) === false ||
    record.cellCount < 0
  ) {
    return { ok: false, status: 400, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  if (record.cellCount > POST_CELL_COUNT_CAP) {
    return { ok: false, status: 413, envelope: POST_FAILURE_ENVELOPES.payloadTooLarge };
  }
  if (
    record.anomalyCounts === null ||
    typeof record.anomalyCounts !== 'object' ||
    Array.isArray(record.anomalyCounts)
  ) {
    return { ok: false, status: 400, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const anomalyCountsRecord = record.anomalyCounts as Record<string, unknown>;
  for (const anomalyKey of Object.keys(anomalyCountsRecord)) {
    if (SWEEP_ANOMALY_CLASSES_SET.has(anomalyKey) === false) {
      return { ok: false, status: 400, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
    }
    const countValue = anomalyCountsRecord[anomalyKey];
    if (
      typeof countValue !== 'number' ||
      Number.isFinite(countValue) === false ||
      Number.isInteger(countValue) === false ||
      countValue < 0
    ) {
      return { ok: false, status: 400, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
    }
  }
  return {
    ok: true,
    payload: {
      runId: record.runId,
      startedAt: record.startedAt,
      cellCount: record.cellCount,
      anomalyCounts: anomalyCountsRecord as Readonly<
        Record<SweepAnomalyClass, number>
      >,
      manifestBlob: record.manifestBlob,
    },
  };
}

/**
 * Register the two sweep routes on the supplied Koa router. The router is
 * mutated in place; the function returns `void`.
 */
export function registerSweepRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: SweepRouteDependencies,
): void {
  router.post('/api/sweep/runs', async (koaContext) => {
    // why (D-11504): `Cache-Control: no-store` first-statement lock ensures
    // error paths cannot ship cacheable responses; downstream operator
    // dashboard reads are explicitly non-cacheable.
    koaContext.set('Cache-Control', 'no-store');
    try {
      const headerToken = readSweepTokenHeader(koaContext.request);
      if (headerToken === null) {
        koaContext.status = 401;
        koaContext.body = POST_FAILURE_ENVELOPES.unauthorized;
        return;
      }
      // why (D-20702): the inline constant-time check is now the shared
      // `validateSharedSecret` helper (length pre-check + constant-time compare);
      // behavior is byte-identical to the pre-WP-231 inline version — this is
      // the one and only change permitted to the existing sweep POST handler.
      if (validateSharedSecret(headerToken, deps.sweepSubmitToken) === false) {
        koaContext.status = 401;
        koaContext.body = POST_FAILURE_ENVELOPES.unauthorized;
        return;
      }
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = POST_FAILURE_ENVELOPES.invalidRequest;
        return;
      }
      let bodyLength: number;
      try {
        bodyLength = JSON.stringify(rawBody).length;
      } catch {
        koaContext.status = 400;
        koaContext.body = POST_FAILURE_ENVELOPES.invalidRequest;
        return;
      }
      if (bodyLength > POST_BODY_SIZE_CAP_BYTES) {
        koaContext.status = 413;
        koaContext.body = POST_FAILURE_ENVELOPES.payloadTooLarge;
        return;
      }
      const validation = validateSweepRunPayload(rawBody);
      if (validation.ok === false) {
        koaContext.status = validation.status;
        koaContext.body = validation.envelope;
        return;
      }
      try {
        await insertSweepRun(database, validation.payload);
      } catch (insertError) {
        if (insertError instanceof SweepRunDuplicateError) {
          // why (D-20701): duplicate run_id returns 409 with the existing row
          // unchanged — no UPSERT semantics; idempotent retry from GitHub
          // Actions must be observable to the caller, not silently swallowed.
          koaContext.status = 409;
          koaContext.body = POST_FAILURE_ENVELOPES.conflict;
          return;
        }
        throw insertError;
      }
      koaContext.status = 201;
      koaContext.body = {
        data: {
          runId: validation.payload.runId,
          accepted: true,
        },
      };
    } catch (caughtError) {
      // why: never re-throw to a global Koa handler — the 500 envelope is
      // locked at `{ data: [], error: 'internal_error' }` per D-11802 = (C).
      // The caught value is intentionally discarded; the response body must
      // not echo SQL fragments or stack traces.
      void caughtError;
      koaContext.status = 500;
      koaContext.body = POST_FAILURE_ENVELOPES.internalError;
    }
  });

  router.get('/api/sweep/latest', async (koaContext) => {
    // why (D-11504): `Cache-Control: no-store` first-statement lock ensures
    // error paths cannot ship cacheable responses; downstream operator
    // dashboard reads are explicitly non-cacheable.
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
          koaContext.body = GET_FAILURE_ENVELOPES.unauthorized;
        } else {
          koaContext.body = GET_FAILURE_ENVELOPES.internalError;
        }
        return;
      }
      // why: GET handler IGNORES query parameters in v1 — does NOT branch,
      // filter, or paginate on `?limit`, `?since`, `?runId`, or anything
      // else; response shape is identical regardless of query string. The
      // request.query is intentionally not read here; the only reachable
      // behavior is "return the latest + recentRuns".
      const recentRuns: readonly SweepRunSummary[] = await fetchRecentSweepRuns(database);
      const latest: SweepRunSummary | null = recentRuns.length === 0 ? null : recentRuns[0]!;
      // why (WP-209): data: { latest, recentRuns } object envelope (NOT data:
      // readonly T[]) because the endpoint serves two semantically distinct
      // payloads — one latest summary + up to 30 recent summaries — in a
      // single response.
      koaContext.status = 200;
      koaContext.body = {
        data: {
          latest,
          recentRuns,
        },
      };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = GET_FAILURE_ENVELOPES.internalError;
    }
  });

  router.get('/api/sweep/runs/latest', async (koaContext) => {
    // why (D-11504): `Cache-Control: no-store` first-statement lock ensures
    // error paths cannot ship cacheable responses.
    koaContext.set('Cache-Control', 'no-store');
    try {
      // why (D-23103): shared-secret `X-Sweep-Token` read realizes the
      // WP-209-deferred blob endpoint for the CI triage consumer ONLY; it is
      // NOT the operator dashboard read path (that stays `GET /api/sweep/latest`,
      // session-gated, blob-free). The CI consumer reuses the sweep token family
      // — no third secret. Auth fires BEFORE any DB I/O.
      const headerToken = readSweepTokenHeader(koaContext.request);
      if (validateSharedSecret(headerToken, deps.sweepSubmitToken) === false) {
        koaContext.status = 401;
        koaContext.body = GET_FAILURE_ENVELOPES.unauthorized;
        return;
      }
      const run: SweepRunWithBlob | null = await fetchLatestSweepRunWithBlob(database);
      // why: the `run` may carry `manifestBlob: null` when the column is null;
      // the route returns it verbatim and the fetch script treats a null `run`
      // OR a null `manifestBlob` as exit 3 (forensic blob required for triage).
      koaContext.status = 200;
      koaContext.body = { data: { run } };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = GET_FAILURE_ENVELOPES.internalError;
    }
  });
}
