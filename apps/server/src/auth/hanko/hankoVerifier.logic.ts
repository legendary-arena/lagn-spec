/**
 * Hanko Session Verifier — Logic (WP-126)
 *
 * `createHankoSessionVerifier(config)` factory. The factory may
 * throw at construction time on invalid config (per D-5201); the
 * returned `verify(token)` closure NEVER throws and always returns
 * `Promise<Result<VerifiedSessionClaim>>` per the WP-112
 * `SessionVerifier` interface.
 *
 * Verification follows the locked 8-step order from WP-126 §Scope
 * (In) §B:
 *
 *   1. Decode the JWT header to extract `kid`. Malformed → invalid_token.
 *   2. Fetch the matching public key from the per-instance JWKS
 *      cache. Cache miss + one-shot refresh-and-retry both fail →
 *      verification_failed.
 *   3. Verify the JWT signature (RS256 via Node v22 `node:crypto`
 *      `createPublicKey({ key: jwk, format: 'jwk' })` +
 *      `createVerify('RSA-SHA256').verify(...)`). Invalid →
 *      invalid_token.
 *   4. Verify the `aud` claim equals `config.expectedAudience`.
 *      Mismatch → invalid_token.
 *   5. Verify the `exp` claim is in the future. Expired →
 *      expired_token.
 *   6. Read the `amr` claim per D-12604; classify via the closed-
 *      set `HANKO_IDP_TO_AUTH_PROVIDER` lookup with federated
 *      values taking precedence over native ones. Missing or
 *      unknown → unknown_provider.
 *   7. Read the `sub` claim verbatim → `authProviderSub`.
 *   8. Return Result.ok({ authProvider, authProviderSub, expiresAt }).
 *
 * Single-parameter `Result<T>` lock (PS-1): every return signature
 * is `Promise<Result<VerifiedSessionClaim>>`. The failure-payload
 * `code` field is structurally typed `IdentityErrorCode`; the
 * verifier emits `SessionVerificationErrorCode` strings into that
 * field via `as never`, mirroring `sessionToken.logic.test.ts`'s
 * settled pattern.
 *
 * Per-instance state lock (D-12603): each factory call constructs
 * an independent `JwksCache`. No module-level singleton.
 *
 * Single-site default-application (D-12603 / PS-3): the
 * `jwksRefreshIntervalMs` default substitutes for `undefined` at
 * exactly one site (the factory body); downstream the cache config
 * always carries a concrete number.
 *
 * Layer-boundary contract: this module imports nothing from
 * boardgame.io, the engine package, the registry package, the
 * pre-planning package, or any UI / client / replay-producer
 * package. The only Node built-in is `node:crypto`.
 *
 * Authority: WP-126 §Scope (In) §A / §B; D-9904 (module-path lock);
 * D-12601..D-12604 (executor-time decision locks); WP-112
 * `SessionVerifier` interface contract; D-5201 (factory-time-only
 * throw posture).
 */

import { createPublicKey, createVerify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { createJwksCache } from './jwksCache.logic.js';
import type { JwksCache } from './jwksCache.logic.js';
import {
  HANKO_IDP_TO_AUTH_PROVIDER,
} from './hankoVerifier.types.js';
import type {
  AuthProvider,
  HankoVerifierConfig,
  Result,
  SessionVerifier,
  VerifiedSessionClaim,
} from './hankoVerifier.types.js';

// why: D-12603 default-application invariant — the JWKS refresh
// interval default lives at exactly one site (the factory body
// below). Downstream code (the cache config, the `verify` closure)
// always sees a concrete number.
const DEFAULT_JWKS_REFRESH_INTERVAL_MS = 300_000;

interface JwtHeader {
  readonly kid: string;
  readonly alg: string;
}

interface JwtPayload {
  readonly sub: string;
  readonly aud: readonly string[];
  readonly exp: number;
  readonly amr: readonly string[];
}

function decodeBase64Url(segment: string): Buffer {
  const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4);
  const standard = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(standard, 'base64');
}

function tryDecodeJson(buffer: Buffer): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return undefined;
  }
}

function parseHeader(headerSegment: string): JwtHeader | undefined {
  const decoded = tryDecodeJson(decodeBase64Url(headerSegment));
  if (decoded === null || typeof decoded !== 'object') {
    return undefined;
  }
  const candidate = decoded as { kid?: unknown; alg?: unknown };
  if (
    typeof candidate.kid !== 'string' ||
    candidate.kid.length === 0 ||
    typeof candidate.alg !== 'string' ||
    candidate.alg.length === 0
  ) {
    return undefined;
  }
  return { kid: candidate.kid, alg: candidate.alg };
}

function parsePayload(payloadSegment: string): JwtPayload | undefined {
  const decoded = tryDecodeJson(decodeBase64Url(payloadSegment));
  if (decoded === null || typeof decoded !== 'object') {
    return undefined;
  }
  const candidate = decoded as {
    sub?: unknown;
    aud?: unknown;
    exp?: unknown;
    amr?: unknown;
  };
  if (typeof candidate.sub !== 'string' || candidate.sub.length === 0) {
    return undefined;
  }
  if (typeof candidate.exp !== 'number' || Number.isFinite(candidate.exp) === false) {
    return undefined;
  }
  let audValues: readonly string[];
  if (typeof candidate.aud === 'string') {
    audValues = [candidate.aud];
  } else if (Array.isArray(candidate.aud)) {
    const allStrings = candidate.aud.every((entry) => typeof entry === 'string');
    if (allStrings === false) {
      return undefined;
    }
    audValues = candidate.aud as readonly string[];
  } else {
    return undefined;
  }
  let amrValues: readonly string[];
  if (Array.isArray(candidate.amr)) {
    const allStrings = candidate.amr.every((entry) => typeof entry === 'string');
    if (allStrings === false) {
      return undefined;
    }
    amrValues = candidate.amr as readonly string[];
  } else {
    amrValues = [];
  }
  return {
    sub: candidate.sub,
    aud: audValues,
    exp: candidate.exp,
    amr: amrValues,
  };
}

function verifyRsa256Signature(
  signedInput: string,
  signatureSegment: string,
  publicKey: KeyObject,
): boolean {
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signedInput);
    verifier.end();
    return verifier.verify(publicKey, decodeBase64Url(signatureSegment));
  } catch {
    return false;
  }
}

function classifyAuthProvider(
  amr: readonly string[],
): AuthProvider | undefined {
  // why: D-12604 two-pass priority scan — federated providers win
  // over native methods. A user who logs in via Google AND has a
  // 2FA passcode in `amr` resolves to `'google'`, not `'email'`.
  // Both passes use object-literal lookup against the closed-set
  // table — no string-prefix check, no regex.
  for (const value of amr) {
    const mapped = HANKO_IDP_TO_AUTH_PROVIDER[value];
    if (mapped !== undefined && mapped !== 'email') {
      return mapped;
    }
  }
  for (const value of amr) {
    const mapped = HANKO_IDP_TO_AUTH_PROVIDER[value];
    if (mapped === 'email') {
      return mapped;
    }
  }
  return undefined;
}

function fail(
  code: 'invalid_token' | 'expired_token' | 'unknown_provider' | 'verification_failed',
  reason: string,
): Result<VerifiedSessionClaim> {
  // why: closed-union error mapping centralized at exactly one site
  // per the WP-112 `SessionVerificationErrorCode` ownership lock.
  // Verifier-side codes are an internal contract between the
  // verifier and the orchestrator; the orchestrator translates them
  // at `sessionToken.logic.ts:191-193`. The `as never` cast follows
  // the project's settled pattern for emitting strings outside
  // `IdentityErrorCode` into the structurally-typed `code` field
  // (see `sessionToken.logic.test.ts` `makeFailingVerifier`).
  return { ok: false, reason, code: code as never };
}

/**
 * Construct a per-instance Hanko session verifier. The factory
 * validates `config.tenantBaseUrl` and `config.expectedAudience`
 * are non-empty (throws at construction time per D-5201);
 * substitutes the D-12603 default `jwksRefreshIntervalMs` at this
 * single site; constructs an independent `JwksCache`; and returns
 * the `SessionVerifier` closure. The closure NEVER throws.
 */
export function createHankoSessionVerifier(
  config: HankoVerifierConfig,
): SessionVerifier {
  // why: D-5201 factory-time-only throw posture. Configuration
  // validity is asserted once at construction; the `verify` closure
  // below assumes a well-formed config and never throws on
  // per-request validation paths.
  if (
    typeof config.tenantBaseUrl !== 'string' ||
    config.tenantBaseUrl.length === 0
  ) {
    throw new Error(
      'createHankoSessionVerifier requires a non-empty tenantBaseUrl. Set the HANKO_TENANT_BASE_URL environment variable to the tenant-scoped origin (for example, https://passkeys.hanko.io/<tenant_id>).',
    );
  }
  if (
    typeof config.expectedAudience !== 'string' ||
    config.expectedAudience.length === 0
  ) {
    throw new Error(
      'createHankoSessionVerifier requires a non-empty expectedAudience. Set the HANKO_EXPECTED_AUDIENCE environment variable to the audience identifier configured in the Hanko tenant.',
    );
  }
  // why: D-12603 single-site default-application — `undefined`
  // substitutes the documented default of 300_000 ms here, exactly
  // once. The cache config carries a concrete number from this
  // point on.
  const refreshIntervalMs =
    config.jwksRefreshIntervalMs ?? DEFAULT_JWKS_REFRESH_INTERVAL_MS;
  const jwksUrl = `${config.tenantBaseUrl}/.well-known/jwks.json`;
  // why: D-12603 per-instance state lock — each factory call
  // constructs an independent JWKS cache. Two
  // `createHankoSessionVerifier(config)` calls produce two
  // independent caches (verified by a dedicated test case).
  const cache: JwksCache = createJwksCache({
    jwksUrl,
    refreshIntervalMs,
    fetcher: config.fetcher,
  });

  async function verify(
    token: string,
  ): Promise<Result<VerifiedSessionClaim>> {
    if (typeof token !== 'string' || token.length === 0) {
      return fail(
        'invalid_token',
        'Session token is empty; the verifier cannot decode an empty string.',
      );
    }
    const segments = token.split('.');
    if (segments.length !== 3) {
      return fail(
        'invalid_token',
        'Session token does not have three dot-separated segments; expected the JWT compact serialization shape header.payload.signature.',
      );
    }
    const [headerSegment, payloadSegment, signatureSegment] = segments;
    const header = parseHeader(headerSegment);
    if (header === undefined) {
      return fail(
        'invalid_token',
        'Session token header is not a valid base64url-encoded JSON object carrying string "kid" and "alg" fields.',
      );
    }
    if (header.alg !== 'RS256') {
      return fail(
        'invalid_token',
        `Session token "alg" header is "${header.alg}"; the verifier accepts only RS256-signed Hanko tokens.`,
      );
    }
    const keyResult = await cache.getKey(header.kid);
    if (keyResult.ok === false) {
      // Cache emits `'cache_miss' | 'refresh_failed'`; both reflect
      // signing-key resolution failures and translate to
      // `'verification_failed'` at this single site.
      return fail(
        'verification_failed',
        keyResult.reason,
      );
    }
    let publicKey: KeyObject;
    try {
      publicKey = createPublicKey({
        key: keyResult.value,
        format: 'jwk',
      });
    } catch (error) {
      const innerMessage =
        error instanceof Error ? error.message : 'unknown crypto error';
      return fail(
        'verification_failed',
        `JWKS key for kid "${header.kid}" could not be imported as an RSA public key: ${innerMessage}.`,
      );
    }
    const signedInput = `${headerSegment}.${payloadSegment}`;
    const signatureValid = verifyRsa256Signature(
      signedInput,
      signatureSegment,
      publicKey,
    );
    if (signatureValid === false) {
      return fail(
        'invalid_token',
        'Session token signature did not verify against the JWKS public key matching its "kid" header.',
      );
    }
    const payload = parsePayload(payloadSegment);
    if (payload === undefined) {
      return fail(
        'invalid_token',
        'Session token payload is not a valid base64url-encoded JSON object carrying the required "sub", "aud", and "exp" claims.',
      );
    }
    if (payload.aud.includes(config.expectedAudience) === false) {
      return fail(
        'invalid_token',
        `Session token "aud" claim does not include the expected audience "${config.expectedAudience}"; the token may have been issued for a different application.`,
      );
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      return fail(
        'expired_token',
        'Session token has expired per its own "exp" claim; the user must re-authenticate to obtain a fresh token.',
      );
    }
    const authProvider = classifyAuthProvider(payload.amr);
    if (authProvider === undefined) {
      return fail(
        'unknown_provider',
        'Session token "amr" claim does not carry a recognized Hanko authentication method reference; the verifier accepts the federated values "ext:google" and "ext:discord" plus the native methods "pwd", "passkey", "otp", "totp", "security_key".',
      );
    }
    const expiresAt = new Date(payload.exp * 1000).toISOString();
    return {
      ok: true,
      value: {
        authProvider,
        authProviderSub: payload.sub,
        expiresAt,
      },
    };
  }

  return { verify };
}
