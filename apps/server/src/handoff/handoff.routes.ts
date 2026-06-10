/**
 * Handoff HTTP Routes — Server Layer (WP-232 / EC-264)
 *
 * Registers three HTTP endpoints on the existing Koa router returned by
 * boardgame.io's `Server({...})` instance:
 *
 *   * `POST /api/handoffs/sync` — `guest` per D-9905 with shared-secret header
 *     auth (`X-Handoff-Token` byte-compared via the shared `validateSharedSecret`
 *     helper). Idempotently materializes one `open` handoff per finding of the
 *     latest inspection report (read via `fetchLatestInspectionReport` only).
 *     Status-code domain `{200, 401, 413, 500}`.
 *
 *   * `POST /api/handoffs/transition` — `guest` per D-9905 with the same
 *     shared-secret header. `handoffId` travels in the BODY (not the path).
 *     Validation (auth / parse / size / shape / conditional-required) completes
 *     BEFORE any DB access (validation-before-read); the mutation is a guarded
 *     atomic UPDATE (0 rows -> re-read -> 404 / 409). Status-code domain
 *     `{200, 400, 401, 404, 409, 413, 500}`.
 *
 *   * `GET /api/handoffs/latest` — `authenticated-session-required` per D-9905;
 *     `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403
 *     carry-forward. Returns `{ data: { reportId, handoffs, counts } }`. Ignores
 *     all query parameters in v1. Status-code domain `{200, 401, 500}`.
 *
 * Mirrors the WP-231 inspection.routes.ts structural shape: local `KoaRouter` /
 * `KoaContext` interfaces (no direct `@koa/router` import), caller-injected
 * dependencies, `Cache-Control: no-store` as the FIRST statement of every handler
 * body per D-11504.
 *
 * Plumbing-only posture (D-23202): `branchRef` / `amendmentRequest` are
 * references the server STORES, never actions it performs — the autonomous
 * Builder/Architect execution is a deferred, separately-gated surface.
 *
 * Layer-boundary contract: imports only `./handoff.types.js`, `./handoff.logic.js`,
 * the shared `../auth/validateSharedSecret.js` helper, and the auth-layer session
 * types. No `boardgame.io`, no `@legendary-arena/game-engine` (anomalyClass stays
 * an opaque string — D-23103), no `apps/dashboard/**`. The constant-time secret
 * comparison appears in NO route file — the shared-secret check lives only in
 * `validateSharedSecret`.
 *
 * Authority: WP-232 §Locked Type Contracts + §Non-Negotiable Constraints +
 * §Acceptance Criteria; EC-264 §Locked Values + §Guardrails + §Required `// why:`
 * Comments; D-23201..D-23203; D-9905 (auth taxonomy); D-10403 (session-code
 * collapse); D-11504 (Cache-Control first-statement lock).
 */

import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';
import { validateSharedSecret } from '../auth/validateSharedSecret.js';
// why: boardgame.io installs koa-body only on its own /games/* routes — no
// global body parser — so these custom routes must attach their own koaBody or
// koaContext.request.body is undefined at the handler (prod 400). Default
// jsonLimit (1mb) is well above the route's 64 KB cap, so the route's own size
// check stays authoritative.
import koaBody from 'koa-body';
import type { DatabaseClient } from './handoff.logic.js';
import {
  HandoffNotFoundError,
  HandoffTransitionError,
  applyHandoffTransition,
  countHandoffsByStatus,
  fetchLatestHandoffs,
  syncHandoffsFromLatestReport,
} from './handoff.logic.js';
import type { HandoffStatus, HandoffTransitionPayload } from './handoff.types.js';
import { HANDOFF_STATUSES } from './handoff.types.js';

/**
 * Closed-set re-statement of the orchestrator's
 * `Result<AccountId, SessionValidationErrorCode>` shape. Declared locally per the
 * WP-205 / WP-209 / WP-231 precedent (this file does not import from
 * `../identity/identity.types.js`).
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
 * Caller-injected dependency bundle for `registerHandoffRoutes`. Mirrors the
 * WP-231 `InspectionRouteDependencies` shape with one handoff-specific addition
 * (`handoffSubmitToken`). The token is loaded once at server startup via the
 * `HANDOFF_SUBMIT_TOKEN` env var (production loud-fail on missing, mirroring
 * `INSPECTION_SUBMIT_TOKEN` / `SWEEP_SUBMIT_TOKEN`).
 */
export interface HandoffRouteDependencies {
  readonly requireAuthenticatedSession: (
    request: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<RequireAuthenticatedSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
  readonly handoffSubmitToken: string;
}

interface KoaHandoffRequest extends SessionTokenRequest {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Readonly<Record<string, string | string[] | undefined>>;
}

interface KoaHandoffContext {
  request: KoaHandoffRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

interface KoaRouter {
  post(
    path: string,
    bodyParser: unknown,
    handler: (koaContext: KoaHandoffContext) => Promise<void> | void,
  ): unknown;
  get(
    path: string,
    handler: (koaContext: KoaHandoffContext) => Promise<void> | void,
  ): unknown;
}

// why: POST body size cap (64 KB). The transition body is a small JSON object
// (`handoffId` <= 320, `branchRef` <= 200, `amendmentRequest` <= 2000) — 64 KB is
// a generous ceiling that bounds a malformed/runaway request well below any
// legitimate payload. The sync body is ignored (`{}`) but the same cap applies
// defensively. Measured via `JSON.stringify(rawBody).length` before any DB I/O.
const POST_BODY_SIZE_CAP_BYTES = 64 * 1024;

// why: per-field length bounds enforced at the validator BEFORE any DB access.
// `handoffId` <= 320 (the `<reportId>#<findingIndex>` composite); `branchRef` <=
// 200 (a git ref / PR URL); `amendmentRequest` <= 2000 (a short escalation
// payload). All per WP-232 §Locked contract values.
const HANDOFF_ID_MAX_LENGTH = 320;
const BRANCH_REF_MAX_LENGTH = 200;
const AMENDMENT_REQUEST_MAX_LENGTH = 2000;

// why: closed-set membership Set built once at module load from the canonical
// `HANDOFF_STATUSES` array. The transition validator rejects a `toStatus` outside
// the union with 400. A union change forces the array (and therefore this Set) to
// update in lockstep via the drift gate in handoff.logic.test.
const HANDOFF_STATUSES_SET: ReadonlySet<string> = new Set(HANDOFF_STATUSES);

// why: closed-set of POST failure-response envelopes (sync + transition). Every
// failure maps to one of these per the WP-232 §Non-Negotiable Constraints lock;
// client-facing error strings carry no stack traces, no SQL fragments, no
// operator-only context.
const POST_FAILURE_ENVELOPES = {
  unauthorized: { data: [], error: 'unauthorized' as const },
  invalidRequest: { data: [], error: 'invalid_request' as const },
  payloadTooLarge: { data: [], error: 'payload_too_large' as const },
  notFound: { data: [], error: 'not_found' as const },
  conflict: { data: [], error: 'conflict' as const },
  internalError: { data: [], error: 'internal_error' as const },
} as const;

// why: GET failure-response envelopes. The locked GET status domain is
// `{200, 401, 500}`; no 400 / 403 / 404 path is reachable because the handler
// ignores all query parameters and the only auth state is "session valid" or
// "session invalid".
const GET_FAILURE_ENVELOPES = {
  unauthorized: { data: [], error: 'unauthorized' as const },
  internalError: { data: [], error: 'internal_error' as const },
} as const;

// why (D-10403 carry-forward): dispatch closed-set SessionValidationCode values
// to the locked HTTP status. The four 401-mapped codes collapse to a single
// client-facing 'unauthorized' value (account-existence-probe defense).
// `session_verifier_not_configured` + `lookup_failed` map to 500 (operator-facing
// production wiring problems, not request-side issues).
function statusForSessionValidationCode(code: SessionValidationCode): number {
  if (code === 'session_verifier_not_configured' || code === 'lookup_failed') {
    return 500;
  }
  return 401;
}

/**
 * Reads the `X-Handoff-Token` header value. Koa lowercases header names; this
 * checks the canonical lowercase key. Returns the string value when present and a
 * single string (NOT an array — duplicate headers are an obvious-malformed
 * request), `null` otherwise.
 */
function readHandoffTokenHeader(request: KoaHandoffRequest): string | null {
  const headers = request.headers;
  if (headers === undefined || headers === null) {
    return null;
  }
  const rawValue = headers['x-handoff-token'];
  if (typeof rawValue === 'string' && rawValue.length > 0) {
    return rawValue;
  }
  return null;
}

/**
 * Validates a `POST /api/handoffs/transition` body against the locked
 * `HandoffTransitionPayload` shape (Evaluation Order steps 3-4). Returns a tagged
 * result so the caller maps each failure to its locked status (400).
 *
 * `branchRef` is REQUIRED (non-empty, <= 200 chars) when `toStatus ===
 * 'fix-proposed'`; `amendmentRequest` is REQUIRED (non-empty, <= 2000 chars) when
 * `toStatus === 'escalated'`. On other transitions the two are optional: an
 * absent key is fine, a present value must still be a well-typed bounded string
 * (it is preserved-not-written by the logic layer). The built payload carries the
 * two references as `string | null` (never `undefined`).
 */
type TransitionValidationResult =
  | { ok: true; payload: HandoffTransitionPayload }
  | { ok: false; envelope: typeof POST_FAILURE_ENVELOPES.invalidRequest };

function validateOptionalReference(
  rawValue: unknown,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false } {
  if (rawValue === undefined || rawValue === null) {
    return { ok: true, value: null };
  }
  if (typeof rawValue !== 'string' || rawValue.length === 0 || rawValue.length > maxLength) {
    return { ok: false };
  }
  return { ok: true, value: rawValue };
}

function validateTransitionPayload(rawBody: unknown): TransitionValidationResult {
  if (rawBody === null || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const record = rawBody as Record<string, unknown>;
  if (
    typeof record.handoffId !== 'string' ||
    record.handoffId.length === 0 ||
    record.handoffId.length > HANDOFF_ID_MAX_LENGTH
  ) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  if (typeof record.toStatus !== 'string' || HANDOFF_STATUSES_SET.has(record.toStatus) === false) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const toStatus = record.toStatus as HandoffStatus;
  // Conditional-required field gate. `fix-proposed` requires a non-empty
  // `branchRef`; `escalated` requires a non-empty `amendmentRequest`. On every
  // other transition both are optional but, when present, must be a bounded
  // string.
  let branchRef: string | null = null;
  let amendmentRequest: string | null = null;
  if (toStatus === 'fix-proposed') {
    if (
      typeof record.branchRef !== 'string' ||
      record.branchRef.length === 0 ||
      record.branchRef.length > BRANCH_REF_MAX_LENGTH
    ) {
      return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
    }
    branchRef = record.branchRef;
  } else {
    const branchRefResult = validateOptionalReference(record.branchRef, BRANCH_REF_MAX_LENGTH);
    if (branchRefResult.ok === false) {
      return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
    }
    branchRef = branchRefResult.value;
  }
  if (toStatus === 'escalated') {
    if (
      typeof record.amendmentRequest !== 'string' ||
      record.amendmentRequest.length === 0 ||
      record.amendmentRequest.length > AMENDMENT_REQUEST_MAX_LENGTH
    ) {
      return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
    }
    amendmentRequest = record.amendmentRequest;
  } else {
    const amendmentResult = validateOptionalReference(
      record.amendmentRequest,
      AMENDMENT_REQUEST_MAX_LENGTH,
    );
    if (amendmentResult.ok === false) {
      return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
    }
    amendmentRequest = amendmentResult.value;
  }
  return {
    ok: true,
    payload: {
      handoffId: record.handoffId,
      toStatus,
      branchRef,
      amendmentRequest,
    },
  };
}

/**
 * Reads the POST body size in code units. Returns `null` when the body cannot be
 * serialized (a circular structure) so the caller maps that to 400.
 */
function measureBodyLength(rawBody: unknown): number | null {
  try {
    return JSON.stringify(rawBody).length;
  } catch {
    return null;
  }
}

/**
 * Register the three handoff routes on the supplied Koa router. The router is
 * mutated in place; the function returns `void`.
 */
export function registerHandoffRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: HandoffRouteDependencies,
): void {
  router.post('/api/handoffs/sync', koaBody(), async (koaContext) => {
    // why (D-11504): `Cache-Control: no-store` first-statement lock ensures error
    // paths cannot ship cacheable responses.
    koaContext.set('Cache-Control', 'no-store');
    try {
      const headerToken = readHandoffTokenHeader(koaContext.request);
      if (validateSharedSecret(headerToken, deps.handoffSubmitToken) === false) {
        koaContext.status = 401;
        koaContext.body = POST_FAILURE_ENVELOPES.unauthorized;
        return;
      }
      // why: the sync body is ignored (the endpoint always syncs the latest
      // report), but the 64 KB cap is enforced defensively so an oversize POST is
      // rejected with 413 before any DB I/O — same validation-before-read posture
      // as the transition handler.
      const rawBody = koaContext.request.body;
      if (rawBody !== undefined && rawBody !== null) {
        const bodyLength = measureBodyLength(rawBody);
        if (bodyLength !== null && bodyLength > POST_BODY_SIZE_CAP_BYTES) {
          koaContext.status = 413;
          koaContext.body = POST_FAILURE_ENVELOPES.payloadTooLarge;
          return;
        }
      }
      const summary = await syncHandoffsFromLatestReport(database);
      koaContext.status = 200;
      koaContext.body = { data: summary };
    } catch (caughtError) {
      // why: never re-throw to a global Koa handler — the 500 envelope is locked
      // at `{ data: [], error: 'internal_error' }`. The caught value is
      // intentionally discarded; the response body must not echo SQL fragments or
      // stack traces.
      void caughtError;
      koaContext.status = 500;
      koaContext.body = POST_FAILURE_ENVELOPES.internalError;
    }
  });

  router.post('/api/handoffs/transition', koaBody(), async (koaContext) => {
    // why (D-11504): `Cache-Control: no-store` first-statement lock ensures error
    // paths cannot ship cacheable responses.
    koaContext.set('Cache-Control', 'no-store');
    try {
      // Step 1 (auth). A 401 issues no DB query (validation-before-read).
      const headerToken = readHandoffTokenHeader(koaContext.request);
      if (validateSharedSecret(headerToken, deps.handoffSubmitToken) === false) {
        koaContext.status = 401;
        koaContext.body = POST_FAILURE_ENVELOPES.unauthorized;
        return;
      }
      // Step 2 (body parse + size). 400 on unparseable / 413 on oversize, no DB.
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = POST_FAILURE_ENVELOPES.invalidRequest;
        return;
      }
      const bodyLength = measureBodyLength(rawBody);
      if (bodyLength === null) {
        koaContext.status = 400;
        koaContext.body = POST_FAILURE_ENVELOPES.invalidRequest;
        return;
      }
      if (bodyLength > POST_BODY_SIZE_CAP_BYTES) {
        koaContext.status = 413;
        koaContext.body = POST_FAILURE_ENVELOPES.payloadTooLarge;
        return;
      }
      // Steps 3-4 (shape + conditional-required). 400, no DB.
      const validation = validateTransitionPayload(rawBody);
      if (validation.ok === false) {
        koaContext.status = 400;
        koaContext.body = validation.envelope;
        return;
      }
      // Steps 5-7 (load -> legality -> guarded atomic UPDATE). The first DB access
      // happens here, AFTER all validation above.
      try {
        // why (D-23202 plumbing-only lock): `branchRef` / `amendmentRequest` are
        // stored references the server RECORDS, never actions it performs — the
        // server creates no git branch, opens no PR, and edits no WP spec. The
        // unattended code-writer (Builder) + spec-writer (Architect) are a deferred,
        // separately-gated surface.
        const handoff = await applyHandoffTransition(
          database,
          validation.payload.handoffId,
          validation.payload,
        );
        koaContext.status = 200;
        koaContext.body = { data: { handoff } };
      } catch (transitionError) {
        if (transitionError instanceof HandoffNotFoundError) {
          koaContext.status = 404;
          koaContext.body = POST_FAILURE_ENVELOPES.notFound;
          return;
        }
        if (transitionError instanceof HandoffTransitionError) {
          // why (D-23202): an off-table transition — or a concurrent transition
          // that already advanced the row — is a 409 with the row's status
          // UNCHANGED, never a silent overwrite.
          koaContext.status = 409;
          koaContext.body = POST_FAILURE_ENVELOPES.conflict;
          return;
        }
        throw transitionError;
      }
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = POST_FAILURE_ENVELOPES.internalError;
    }
  });

  router.get('/api/handoffs/latest', async (koaContext) => {
    // why (D-11504): `Cache-Control: no-store` first-statement lock ensures error
    // paths cannot ship cacheable responses.
    koaContext.set('Cache-Control', 'no-store');
    try {
      const sessionResult = await deps.requireAuthenticatedSession(koaContext.request, {
        verifier: deps.verifier,
        accountResolver: deps.accountResolver,
        database: database as unknown as RequireAuthenticatedSessionOptions['database'],
      });
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
      // why: GET handler IGNORES query parameters in v1 — does NOT branch, filter,
      // or paginate; the response shape is identical regardless of query string.
      const latest = await fetchLatestHandoffs(database);
      const counts = countHandoffsByStatus(latest.handoffs);
      koaContext.status = 200;
      koaContext.body = {
        data: {
          reportId: latest.reportId,
          handoffs: latest.handoffs,
          counts,
        },
      };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = GET_FAILURE_ENVELOPES.internalError;
    }
  });
}
