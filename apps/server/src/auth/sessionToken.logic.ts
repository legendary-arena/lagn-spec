/**
 * Session Token Logic — Server Layer (WP-112)
 *
 * Broker-agnostic orchestrator implementing the
 * `requireAuthenticatedSession(req, options): Promise<Result<AccountId>>`
 * contract referenced by WP-101 / WP-102 / WP-104 via the
 * caller-injected provider pattern. The orchestrator owns four
 * concerns and four only:
 *
 *   1. Token extraction from the request (per D-11202 — bearer
 *      header only).
 *   2. Delegation to a caller-injected `SessionVerifier`.
 *   3. Defense-in-depth `expiresAt` check on the verified claim.
 *   4. Delegation to a caller-injected `AccountResolver`.
 *
 * Broker-specific code lives in WP-126 under
 * `apps/server/src/auth/hanko/`; this module imports zero broker
 * symbols, carries no broker name as a string literal, and would
 * not change if the broker were swapped for a self-hosted JWT
 * signer (WP-099 D-9901 replacement-safety contract).
 *
 * Layer-boundary contract: this module imports nothing from
 * boardgame.io, the engine package, the registry package, the
 * pre-planning package, or any UI / client / replay-producer
 * package. Type imports come from `./sessionToken.types.js` and
 * `../identity/identity.types.js` exclusively; there is no
 * runtime import.
 *
 * Result-type contract: every failure path returns `Result.fail`
 * with a closed-union `code` and a full-sentence `reason`. The
 * orchestrator never throws — moves never throw is an engine rule,
 * but the same discipline applies here per WP-052 D-5201.
 *
 * Authority: WP-112 §Scope (In) §B; WP-099 §A (policy contract);
 * D-11201..D-11204; WP-052 D-5201 (Result-typed identity contract).
 */

import type {
  AccountId,
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  Result,
  SessionTokenRequest,
  SessionValidationErrorCode,
  SessionVerificationErrorCode,
  SessionVerifier,
  VerifiedSessionClaim,
} from './sessionToken.types.js';

/**
 * Extract a bearer token from the request's `Authorization` header
 * per D-11202 (bearer header only — no cookie path, no WebSocket
 * carrier in WP-112). Returns `null` when the header is missing,
 * malformed, or carries an empty token after the `Bearer ` prefix.
 *
 * Both lowercase `authorization` (the Node `IncomingMessage`
 * convention) and capitalized `Authorization` (the HTTP spec
 * spelling) are accepted; the lowercase variant takes precedence
 * when both are present, matching Node's normalization. A repeated
 * header that arrives as `string[]` consults the first entry only —
 * an authenticated request that legitimately sends two
 * `Authorization` headers is malformed.
 */
export function extractBearerToken(req: SessionTokenRequest): string | null {
  // why: Node lowercases incoming HTTP header keys on `IncomingMessage`,
  // but the contract accepts arbitrary adapters. Read both spellings
  // so a custom request shape with a capitalized key still works.
  const lower = req.headers['authorization'];
  const capitalized = req.headers['Authorization'];
  const raw = lower !== undefined ? lower : capitalized;
  if (raw === undefined) {
    return null;
  }
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const prefix = 'Bearer ';
  if (value.startsWith(prefix) === false) {
    return null;
  }
  const token = value.slice(prefix.length).trim();
  if (token.length === 0) {
    return null;
  }
  return token;
}

// why: defense-in-depth per WP-112 §Locked contract values. The
// verifier may not enforce expiration (different brokers handle
// `exp` differently); the orchestrator-side check is an
// independent inclusive comparison `expiresAt <= now()` with no
// clock-skew tolerance — skew is the verifier's responsibility
// (WP-126 owns Hanko's skew posture). Boundary inclusivity means a
// claim whose `expiresAt` matches the current ISO timestamp is
// already expired, which matches the standard JWT `exp` semantics.
// An unparseable `expiresAt` is treated as expired; a verifier
// MUST emit ISO-8601 to satisfy the `VerifiedSessionClaim` contract.
function isClaimExpired(claim: VerifiedSessionClaim, nowMs: number): boolean {
  const expiresAtMs = Date.parse(claim.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }
  return expiresAtMs <= nowMs;
}

// why: error-code mapping centralized at exactly one site per
// WP-112 §Scope (In) §B "Error-code ownership". Verifier-side
// codes (`SessionVerificationErrorCode`) are an internal contract
// between the verifier and the orchestrator; they MUST NOT
// propagate verbatim to a caller of `requireAuthenticatedSession`.
// A future verifier swap (Hanko → self-hosted JWT signer) can
// introduce new verifier codes without breaking caller dispatch
// on `SessionValidationErrorCode`. Both `'unknown_provider'` and
// `'verification_failed'` collapse to `'invalid_token'` because
// the caller dispatches on a public-facing token-correctness
// boundary, not on the verifier's internal taxonomy.
function mapVerifierCodeToValidationCode(
  code: SessionVerificationErrorCode,
): SessionValidationErrorCode {
  switch (code) {
    case 'invalid_token':
      return 'invalid_token';
    case 'expired_token':
      return 'expired_token';
    case 'unknown_provider':
      return 'invalid_token';
    case 'verification_failed':
      return 'invalid_token';
  }
}

/**
 * Authoritative session-validation orchestrator. Steps in order:
 *
 *   1. If `options.verifier` or `options.accountResolver` is
 *      missing, return the fail-closed `'session_verifier_not_configured'`
 *      Result (per D-11204).
 *   2. Extract the bearer token; on missing / malformed header,
 *      return `'missing_token'`.
 *   3. Call `options.verifier.verify(token)`; on failure, translate
 *      the verifier-side code via `mapVerifierCodeToValidationCode`
 *      and propagate the verifier's `reason` to the caller.
 *   4. Apply the inclusive `expiresAt <= now()` defense-in-depth
 *      check; on expired claim, return `'expired_token'`.
 *   5. Delegate to `options.accountResolver(claim, database)`; the
 *      resolver returns `Result<AccountId>` directly and the
 *      orchestrator returns its result verbatim.
 *
 * The orchestrator never throws. A future request-handler WP
 * dispatches on the closed-union `code` — `'missing_token'` /
 * `'invalid_token'` / `'expired_token'` typically map to HTTP 401;
 * `'unknown_account'` to HTTP 403 or 401 depending on the route's
 * leak posture; `'session_verifier_not_configured'` and
 * `'lookup_failed'` to HTTP 500 with operator-facing logging.
 */
export async function requireAuthenticatedSession(
  req: SessionTokenRequest,
  options: RequireAuthenticatedSessionOptions,
): Promise<Result<AccountId>> {
  if (options.verifier === undefined) {
    return {
      ok: false,
      reason:
        'No session verifier is configured. Production startup must call configureSessionValidation({ verifier, accountResolver, database }) before authenticated routes accept traffic.',
      code: 'session_verifier_not_configured',
    };
  }
  if (options.accountResolver === undefined) {
    return {
      ok: false,
      reason:
        'No account resolver is configured. Production startup must call configureSessionValidation({ verifier, accountResolver, database }) before authenticated routes accept traffic.',
      code: 'session_verifier_not_configured',
    };
  }
  const token = extractBearerToken(req);
  if (token === null) {
    return {
      ok: false,
      reason:
        'Authorization header is missing or malformed; expected an "Authorization: Bearer <token>" header carrying a non-empty token.',
      code: 'missing_token',
    };
  }
  const verification = await options.verifier.verify(token);
  if (verification.ok === false) {
    return {
      ok: false,
      reason: verification.reason,
      code: mapVerifierCodeToValidationCode(
        verification.code as SessionVerificationErrorCode,
      ),
    };
  }
  if (isClaimExpired(verification.value, Date.now())) {
    return {
      ok: false,
      reason:
        'Session token has expired; the orchestrator-side expiresAt check failed. Re-authenticate to obtain a fresh token.',
      code: 'expired_token',
    };
  }
  const resolution = await options.accountResolver(
    verification.value,
    options.database,
  );
  if (resolution.ok === false) {
    return resolution;
  }
  if (resolution.value === null) {
    return {
      ok: false,
      reason:
        'Verifier accepted the token but no legendary.players row matches the (authProvider, authProviderSub) claim pair; the account has not yet been provisioned.',
      code: 'unknown_account',
    };
  }
  return { ok: true, value: resolution.value };
}

/**
 * Convenience factory that binds a verifier + resolver + database
 * pool once at production startup and returns a closure with the
 * locked single-argument signature
 * `(req) => Promise<Result<AccountId>>`. A future request-handler
 * WP calls this exactly once at server boot; route handlers receive
 * the closure and never see the underlying options. Tests do NOT
 * use this factory — they call `requireAuthenticatedSession` with
 * explicit injected fakes per the WP-101 / WP-102 / WP-104
 * caller-injected pattern.
 *
 * The factory itself does not invoke the verifier; it only binds
 * the dependencies. The first verify call happens on the first
 * authenticated request the bound closure receives.
 */
export function configureSessionValidation(deps: {
  verifier: SessionVerifier;
  accountResolver: AccountResolver;
  database: RequireAuthenticatedSessionOptions['database'];
}): (req: SessionTokenRequest) => Promise<Result<AccountId>> {
  const bound: RequireAuthenticatedSessionOptions = {
    verifier: deps.verifier,
    accountResolver: deps.accountResolver,
    database: deps.database,
  };
  return (req) => requireAuthenticatedSession(req, bound);
}
