/**
 * Inspection HTTP Routes — Server Layer (WP-231 / EC-263)
 *
 * Registers two HTTP endpoints on the existing Koa router returned by
 * boardgame.io's `Server({...})` instance:
 *
 *   * `POST /api/inspection/reports` — `guest` per D-9905 with shared-secret
 *     header auth (`X-Inspection-Token` byte-compared via the shared
 *     `validateSharedSecret` helper). RECOMPUTES `verdict` + the three counts
 *     server-side from `findings` and IGNORES any client-supplied derived
 *     values (D-23101 — never compared, no 400). Idempotent by `report_id`
 *     PRIMARY KEY: a duplicate returns 409 with the existing row UNCHANGED.
 *     Status-code domain `{201, 400, 401, 409, 413, 500}`.
 *
 *   * `GET /api/inspection/latest` — `authenticated-session-required` per D-9905;
 *     `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403
 *     carry-forward. Returns `{ data: { latest, recentReports } }` (object
 *     envelope — two payloads in one response, same deviation WP-209 justified).
 *     Ignores all query parameters in v1. Status-code domain `{200, 401, 500}`.
 *
 * Mirrors the WP-209 sweep.routes.ts / WP-205 analytics.routes.ts structural
 * shape: local `KoaRouter` / `KoaContext` interfaces (no direct `@koa/router`
 * import), caller-injected `InspectionRouteDependencies`, `Cache-Control:
 * no-store` as the FIRST statement of every handler body per D-11504.
 *
 * Layer-boundary contract: imports only `./inspection.types.js`,
 * `./inspection.logic.js`, the shared `../auth/validateSharedSecret.js` helper,
 * and the auth-layer session types. No `boardgame.io`, no
 * `@legendary-arena/game-engine` (anomalyClass stays an opaque string — D-23103),
 * no `apps/dashboard/**`. The constant-time secret comparison appears in NO
 * route file — the shared-secret check lives only in `validateSharedSecret`.
 *
 * Authority: WP-231 §Locked Type Contracts + §Non-Negotiable Constraints +
 * §Acceptance Criteria; EC-263 §Locked Values + §Guardrails + §Required
 * `// why:` Comments; D-23101 (derived-field authority); D-23102 (LLM triage
 * posture); D-9905 (auth taxonomy); D-10403 (session-code collapse); D-11504
 * (Cache-Control first-statement lock).
 */

import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';
import { validateSharedSecret } from '../auth/validateSharedSecret.js';
import type { DatabaseClient } from './inspection.logic.js';
import {
  InspectionReportDuplicateError,
  fetchRecentInspectionReports,
  insertInspectionReport,
} from './inspection.logic.js';
import type {
  InspectionFinding,
  InspectionReportPayload,
  InspectionReportSummary,
  InspectionRoute,
  InspectionSeverity,
} from './inspection.types.js';
import { INSPECTION_ROUTES, INSPECTION_SEVERITIES } from './inspection.types.js';

/**
 * Closed-set re-statement of the orchestrator's
 * `Result<AccountId, SessionValidationErrorCode>` shape. Declared locally per
 * the WP-104 / WP-132 / WP-205 / WP-209 precedent (this file does not import
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
 * Caller-injected dependency bundle for `registerInspectionRoutes`. Mirrors the
 * WP-209 `SweepRouteDependencies` shape with one inspection-specific addition
 * (`inspectionSubmitToken`). The token is loaded once at server startup via the
 * `INSPECTION_SUBMIT_TOKEN` env var (production loud-fail on missing, mirroring
 * `SWEEP_SUBMIT_TOKEN` / `ANALYTICS_USER_ID_SALT`).
 */
export interface InspectionRouteDependencies {
  readonly requireAuthenticatedSession: (
    request: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<RequireAuthenticatedSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
  readonly inspectionSubmitToken: string;
}

interface KoaInspectionRequest extends SessionTokenRequest {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Readonly<Record<string, string | string[] | undefined>>;
}

interface KoaInspectionContext {
  request: KoaInspectionRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

interface KoaRouter {
  post(
    path: string,
    handler: (koaContext: KoaInspectionContext) => Promise<void> | void,
  ): unknown;
  get(
    path: string,
    handler: (koaContext: KoaInspectionContext) => Promise<void> | void,
  ): unknown;
}

// why: POST body size cap (5 MB). A triage report carries up to 500 findings of
// <= 1000 chars each (~0.5 MB of text worst-case) plus envelope; the 5 MB
// ceiling carries a wide safety margin while bounding a runaway agent. Measured
// via `JSON.stringify(rawBody).length` (UTF-16 code units) before any DB I/O.
const POST_BODY_SIZE_CAP_BYTES = 5 * 1024 * 1024;

// why: findings length cap (500). Bounds unbounded LLM output and protects the
// Postgres row size + dashboard rendering performance; a triage emitting > 500
// distinct findings signals a runaway agent, not a real result. Rejected with
// 400 before the INSERT.
const FINDINGS_MAX_LENGTH = 500;

// why: reportId / sweepRunId / per-finding string length bounds enforced at the
// validator BEFORE the INSERT. `reportId` <= 160 (the `<sweepRunId>-<iso>`
// composite); `sweepRunId` <= 128 (matches the WP-209 sweep runId bound);
// `description` <= 1000 (a full-sentence finding); `anomalyClass` <= 128 (a
// SWEEP_ANOMALY_CLASSES member or 'meta' — opaque, never validated for
// membership on the inspection surface per D-23103).
const REPORT_ID_MAX_LENGTH = 160;
const SWEEP_RUN_ID_MAX_LENGTH = 128;
const DESCRIPTION_MAX_LENGTH = 1000;
const ANOMALY_CLASS_MAX_LENGTH = 128;

// why: closed-set membership Sets built once at module load from the canonical
// arrays. The validator rejects findings whose `severity` / `route` fall
// outside the unions with 400. A union change forces the array (and therefore
// this Set) to update in lockstep via the drift gate in inspection.logic.test.
const INSPECTION_SEVERITIES_SET: ReadonlySet<string> = new Set(INSPECTION_SEVERITIES);
const INSPECTION_ROUTES_SET: ReadonlySet<string> = new Set(INSPECTION_ROUTES);

// why: closed-set of POST failure-response envelopes. Every failure maps to one
// of these per the WP-231 §Non-Negotiable Constraints lock; client-facing error
// strings carry no stack traces, no SQL fragments, no operator-only context.
const POST_FAILURE_ENVELOPES = {
  unauthorized: { data: [], error: 'unauthorized' as const },
  invalidRequest: { data: [], error: 'invalid_request' as const },
  payloadTooLarge: { data: [], error: 'payload_too_large' as const },
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
// `session_verifier_not_configured` + `lookup_failed` map to 500 (operator-
// facing production wiring problems, not request-side issues).
function statusForSessionValidationCode(code: SessionValidationCode): number {
  if (code === 'session_verifier_not_configured' || code === 'lookup_failed') {
    return 500;
  }
  return 401;
}

/**
 * Reads the `X-Inspection-Token` header value. Koa lowercases header names;
 * this checks the canonical lowercase key. Returns the string value when
 * present and a single string (NOT an array — duplicate headers are an
 * obvious-malformed request), `null` otherwise.
 */
function readInspectionTokenHeader(request: KoaInspectionRequest): string | null {
  const headers = request.headers;
  if (headers === undefined || headers === null) {
    return null;
  }
  const rawValue = headers['x-inspection-token'];
  if (typeof rawValue === 'string' && rawValue.length > 0) {
    return rawValue;
  }
  return null;
}

/**
 * Validates a single finding against the locked `InspectionFinding` shape.
 * Content (the description TEXT) is NOT judged — only shape — because the
 * findings are LLM-generated and nondeterministic (D-23102). `anomalyClass` is
 * accepted as any non-empty string (opaque — no engine-union membership check,
 * D-23103).
 */
function isValidFinding(candidate: unknown): candidate is InspectionFinding {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  if (typeof record.severity !== 'string' || INSPECTION_SEVERITIES_SET.has(record.severity) === false) {
    return false;
  }
  if (typeof record.route !== 'string' || INSPECTION_ROUTES_SET.has(record.route) === false) {
    return false;
  }
  if (
    typeof record.anomalyClass !== 'string' ||
    record.anomalyClass.length === 0 ||
    record.anomalyClass.length > ANOMALY_CLASS_MAX_LENGTH
  ) {
    return false;
  }
  if (
    typeof record.description !== 'string' ||
    record.description.length === 0 ||
    record.description.length > DESCRIPTION_MAX_LENGTH
  ) {
    return false;
  }
  if (record.cellId !== null && typeof record.cellId !== 'string') {
    return false;
  }
  return true;
}

/**
 * Validates a POST request body against the locked `InspectionReportPayload`
 * shape per the WP-231 §Locked Type Contracts validator failure-mode table.
 * Returns a tagged result so the caller maps each failure to its locked status.
 *
 * Derived fields (`verdict`, counts) are DELIBERATELY NOT validated here — the
 * server recomputes them at insert time and ignores whatever the client sent
 * (D-23101). A `verdict` that disagrees with the findings is not a 400.
 */
type PayloadValidationResult =
  | { ok: true; payload: InspectionReportPayload }
  | { ok: false; envelope: typeof POST_FAILURE_ENVELOPES.invalidRequest };

function validateInspectionReportPayload(rawBody: unknown): PayloadValidationResult {
  if (rawBody === null || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const record = rawBody as Record<string, unknown>;
  if (
    typeof record.reportId !== 'string' ||
    record.reportId.length === 0 ||
    record.reportId.length > REPORT_ID_MAX_LENGTH
  ) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  if (
    typeof record.sweepRunId !== 'string' ||
    record.sweepRunId.length === 0 ||
    record.sweepRunId.length > SWEEP_RUN_ID_MAX_LENGTH
  ) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  if (typeof record.generatedAt !== 'string' || record.generatedAt.length === 0) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const generatedAtDate = new Date(record.generatedAt);
  if (Number.isNaN(generatedAtDate.getTime())) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  if (Array.isArray(record.findings) === false) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const rawFindings = record.findings as unknown[];
  if (rawFindings.length > FINDINGS_MAX_LENGTH) {
    return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
  }
  const findings: InspectionFinding[] = [];
  for (const candidate of rawFindings) {
    if (isValidFinding(candidate) === false) {
      return { ok: false, envelope: POST_FAILURE_ENVELOPES.invalidRequest };
    }
    findings.push({
      severity: candidate.severity as InspectionSeverity,
      anomalyClass: candidate.anomalyClass,
      cellId: candidate.cellId,
      description: candidate.description,
      route: candidate.route as InspectionRoute,
    });
  }
  return {
    ok: true,
    payload: {
      reportId: record.reportId,
      sweepRunId: record.sweepRunId,
      generatedAt: record.generatedAt,
      // why (D-23101): the client `verdict` is carried through the type but the
      // server IGNORES it — `insertInspectionReport` recomputes the verdict +
      // counts from `findings`. A placeholder is bound here only to satisfy the
      // payload type; it is never trusted, compared, or stored.
      verdict: 'PASS',
      findings,
    },
  };
}

/**
 * Register the two inspection routes on the supplied Koa router. The router is
 * mutated in place; the function returns `void`.
 */
export function registerInspectionRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: InspectionRouteDependencies,
): void {
  router.post('/api/inspection/reports', async (koaContext) => {
    // why (D-11504): `Cache-Control: no-store` first-statement lock ensures
    // error paths cannot ship cacheable responses.
    koaContext.set('Cache-Control', 'no-store');
    try {
      const headerToken = readInspectionTokenHeader(koaContext.request);
      if (validateSharedSecret(headerToken, deps.inspectionSubmitToken) === false) {
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
      const validation = validateInspectionReportPayload(rawBody);
      if (validation.ok === false) {
        koaContext.status = 400;
        koaContext.body = validation.envelope;
        return;
      }
      try {
        // why (D-23101 + D-23102): the server is the SOLE authority for the
        // derived fields — `insertInspectionReport` recomputes `verdict` AND the
        // p0/p1/p2 counts from `findings` and stores those, ignoring any
        // client-supplied derived values (never compared, no 400). The
        // LLM-proposed findings are nondeterministic, but the durable derived
        // fields stay authoritative and reproducible from the stored findings.
        await insertInspectionReport(database, validation.payload);
      } catch (insertError) {
        if (insertError instanceof InspectionReportDuplicateError) {
          // why (D-23101): a duplicate reportId returns 409 with the existing
          // row unchanged — re-triage across runs gets a fresh generatedAt -> a
          // fresh reportId, so a 409 means an exact-duplicate submission (a
          // same-run retry or a bug), which must be observable, not swallowed.
          koaContext.status = 409;
          koaContext.body = POST_FAILURE_ENVELOPES.conflict;
          return;
        }
        throw insertError;
      }
      koaContext.status = 201;
      koaContext.body = {
        data: {
          reportId: validation.payload.reportId,
          accepted: true,
        },
      };
    } catch (caughtError) {
      // why: never re-throw to a global Koa handler — the 500 envelope is locked
      // at `{ data: [], error: 'internal_error' }`. The caught value is
      // intentionally discarded; the response body must not echo SQL fragments
      // or stack traces.
      void caughtError;
      koaContext.status = 500;
      koaContext.body = POST_FAILURE_ENVELOPES.internalError;
    }
  });

  router.get('/api/inspection/latest', async (koaContext) => {
    // why (D-11504): `Cache-Control: no-store` first-statement lock ensures
    // error paths cannot ship cacheable responses.
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
      // filter, or paginate; response shape is identical regardless of query
      // string. The only reachable behavior is "return latest + recentReports".
      const recentReports: readonly InspectionReportSummary[] =
        await fetchRecentInspectionReports(database);
      const latest: InspectionReportSummary | null =
        recentReports.length === 0 ? null : recentReports[0]!;
      // why (WP-231): data: { latest, recentReports } object envelope (NOT data:
      // readonly T[]) because the endpoint serves two semantically distinct
      // payloads — one latest summary + up to 30 recent summaries — in one
      // response (same deviation WP-209's GET /api/sweep/latest justified).
      koaContext.status = 200;
      koaContext.body = {
        data: {
          latest,
          recentReports,
        },
      };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = GET_FAILURE_ENVELOPES.internalError;
    }
  });
}
