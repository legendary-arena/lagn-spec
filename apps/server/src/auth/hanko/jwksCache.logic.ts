/**
 * JWKS Cache — Logic (WP-126)
 *
 * Per-instance JWKS (JSON Web Key Set, RFC 7517) cache with
 * single-flight refresh, one-shot retry on cache miss, graceful
 * degradation on refresh failure, and aliasing-defended `getKey`.
 * The cache is consumed by the Hanko verifier; the verifier
 * translates the cache's local error codes
 * (`'cache_miss' | 'refresh_failed'`) into the WP-112
 * `SessionVerificationErrorCode` closed union at exactly one site.
 *
 * Single-parameter Result lock (PS-1): every cache return signature
 * uses the shipped one-type-parameter Result form — the alternative
 * two-parameter form (a separate error-code type parameter) is
 * deliberately not introduced here. The failure-payload `code` field
 * is structurally typed `IdentityErrorCode` (per the shipped contract
 * at `identity.types.ts:139-141`); the cache emits
 * `JwksCacheErrorCode` strings into that field via `as never`,
 * mirroring the project's settled pattern (see
 * `sessionToken.logic.test.ts` `makeFailingVerifier` for the
 * precedent).
 *
 * Per-instance state lock (D-12603): two `createJwksCache(config)`
 * calls produce two independent caches. No module-level singleton.
 * State lives inside the closure returned by the factory.
 *
 * Single-flight (D-12603): N concurrent `getKey(kid)` calls during
 * an in-flight refresh deduplicate to exactly one fetcher
 * invocation. Concurrent waiters share the same `Promise<Response>`.
 *
 * Graceful degradation (D-12603): a failed refresh leaves the
 * existing cache in place. A subsequent `getKey(kid)` for a still-
 * cached `kid` returns the cached key; only a `getKey(kid)` for an
 * uncached `kid` after a failed refresh emits `'refresh_failed'`.
 *
 * Aliasing defense (D-12603 + copilot Issue #17): keys are frozen
 * with `Object.freeze` at insertion time. Mutating the object
 * returned by `getKey(kid)` either no-ops (in non-strict mode) or
 * throws (in strict mode); either way, the cache's stored shape is
 * preserved across subsequent `getKey` calls.
 *
 * Layer-boundary contract: this module imports nothing from
 * boardgame.io, `packages/game-engine`, `packages/registry`,
 * `packages/preplan`, or any UI / client / replay-producer package.
 *
 * Authority: WP-126 §Scope (In) §B; D-12603 (JWKS refresh policy
 * lock); WP-112 caller-injected provider pattern (mirrored here as
 * `JwksFetcher`).
 */

import type {
  JwksFetcher,
  Result,
} from './hankoVerifier.types.js';

/**
 * Local error-code union emitted by the cache. The verifier
 * translates these into `SessionVerificationErrorCode` values at
 * the call site in `hankoVerifier.logic.ts`.
 */
export type JwksCacheErrorCode = 'cache_miss' | 'refresh_failed';

/**
 * Canonical readonly array mirroring `JwksCacheErrorCode` per
 * `00.6-code-style.md §"Drift Detection"`. Adding or removing a
 * code must touch both this array and the union together.
 */
export const JWKS_CACHE_ERROR_CODES: readonly JwksCacheErrorCode[] = [
  'cache_miss',
  'refresh_failed',
] as const;

/**
 * Per-instance cache configuration. `jwksUrl` is the fully-resolved
 * JWKS endpoint (the verifier factory composes
 * `${tenantBaseUrl}/.well-known/jwks.json` and passes it in).
 * `refreshIntervalMs` is always a concrete number — the verifier
 * factory substitutes the D-12603 default at exactly one site
 * before constructing this config.
 */
export interface JwksCacheConfig {
  readonly jwksUrl: string;
  readonly refreshIntervalMs: number;
  readonly fetcher?: JwksFetcher;
}

/**
 * Public cache interface. Only `getKey` is exposed; the interval
 * timer, in-flight promise, and stored map are closure-private.
 */
export interface JwksCache {
  getKey(kid: string): Promise<Result<JsonWebKey>>;
}

/**
 * Fetch a fresh JWKS document from the configured URL and produce
 * a `kid -> JsonWebKey` map. Throws are caught and surfaced via
 * `Result.fail` to the caller.
 */
async function fetchJwks(
  url: string,
  fetcher: JwksFetcher,
): Promise<Result<ReadonlyMap<string, JsonWebKey>>> {
  try {
    const response = await fetcher(url);
    if (response.ok === false) {
      return {
        ok: false,
        reason: `JWKS fetch returned HTTP ${response.status} from ${url}; the verifier cannot refresh its public-key cache.`,
        code: 'refresh_failed' as never,
      };
    }
    const body: unknown = await response.json();
    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray((body as { keys?: unknown }).keys) === false
    ) {
      return {
        ok: false,
        reason: `JWKS response from ${url} is not a JSON object with a "keys" array; expected RFC 7517 shape { keys: JsonWebKey[] }.`,
        code: 'refresh_failed' as never,
      };
    }
    const keys = (body as { keys: readonly unknown[] }).keys;
    const map = new Map<string, JsonWebKey>();
    for (const entry of keys) {
      if (entry === null || typeof entry !== 'object') {
        continue;
      }
      const key = entry as JsonWebKey & { kid?: unknown };
      if (typeof key.kid !== 'string' || key.kid.length === 0) {
        continue;
      }
      // why: D-12603 aliasing defense + copilot Issue #17. Freezing
      // at insertion time means a caller mutating the returned key
      // either no-ops (sloppy mode) or throws (strict mode); the
      // stored shape is preserved across subsequent getKey calls.
      map.set(key.kid, Object.freeze({ ...key }));
    }
    return { ok: true, value: map };
  } catch (error) {
    const innerMessage =
      error instanceof Error
        ? error.message
        : 'a non-Error value was thrown';
    const punctuated = innerMessage.endsWith('.')
      ? innerMessage
      : `${innerMessage}.`;
    return {
      ok: false,
      reason: `JWKS fetch from ${url} threw: ${punctuated}`,
      code: 'refresh_failed' as never,
    };
  }
}

/**
 * Construct a per-instance JWKS cache. The returned cache exposes
 * only `getKey(kid)`; the interval timer, single-flight state, and
 * stored map are closure-private. Callers MUST hold the returned
 * `JwksCache` for the lifetime of the verifier — there is no
 * dispose method (the interval timer keeps the process from idle-
 * exiting, which matches the verifier's "alive for the life of the
 * server" lifetime).
 */
export function createJwksCache(config: JwksCacheConfig): JwksCache {
  // why: D-12603 per-instance state lock — every cache field below
  // lives in this closure. A second `createJwksCache(config)` call
  // produces an independent cache (verified by a test case).
  let storedKeys: Map<string, JsonWebKey> = new Map();
  let inFlightRefresh:
    | Promise<Result<ReadonlyMap<string, JsonWebKey>>>
    | null = null;

  // why: D-12603 fetcher-resolution site — `config.fetcher ?? fetch`
  // happens at exactly this site. Production wiring leaves
  // `config.fetcher` undefined; tests inject a fake. The fallback
  // resolves once at construction; subsequent `getKey` calls reuse
  // the bound reference.
  const resolvedFetcher: JwksFetcher = config.fetcher ?? fetch;

  async function refresh(): Promise<Result<ReadonlyMap<string, JsonWebKey>>> {
    // why: D-12603 single-flight invariant — concurrent `getKey`
    // callers during an in-flight refresh share the same promise
    // and consume exactly one fetcher invocation. The flag clears
    // in a finally block so a failed refresh does not pin the cache
    // into a broken state.
    if (inFlightRefresh !== null) {
      return inFlightRefresh;
    }
    const refreshPromise = fetchJwks(config.jwksUrl, resolvedFetcher);
    inFlightRefresh = refreshPromise;
    try {
      const result = await refreshPromise;
      if (result.ok === true) {
        storedKeys = new Map(result.value);
      }
      // why: D-12603 graceful-degradation lock — a failed refresh
      // leaves the existing `storedKeys` map untouched. A
      // subsequent `getKey` for a still-cached `kid` succeeds; only
      // a miss after a failed refresh surfaces `'refresh_failed'`.
      return result;
    } finally {
      inFlightRefresh = null;
    }
  }

  // why: kick off the periodic refresh timer at construction. The
  // first refresh runs immediately so the cache is populated before
  // the verifier's first `verify(token)` call. Errors are dropped
  // here (a future wiring WP may attach logging); the cache stays
  // usable because graceful degradation preserves any prior keys.
  // `unref()` keeps the timer from blocking process exit.
  void refresh();
  setInterval(() => {
    void refresh();
  }, config.refreshIntervalMs).unref();

  async function getKey(kid: string): Promise<Result<JsonWebKey>> {
    const cached = storedKeys.get(kid);
    if (cached !== undefined) {
      return { ok: true, value: cached };
    }
    // why: D-12603 one-shot retry — a single refresh-and-retry per
    // cache-miss `getKey` call. If the post-refresh map still does
    // not carry `kid`, the cache surfaces `'cache_miss'` and the
    // verifier translates it to `'verification_failed'`.
    const refreshResult = await refresh();
    if (refreshResult.ok === false) {
      return {
        ok: false,
        reason: refreshResult.reason,
        code: refreshResult.code,
      };
    }
    const afterRefresh = storedKeys.get(kid);
    if (afterRefresh !== undefined) {
      return { ok: true, value: afterRefresh };
    }
    return {
      ok: false,
      reason: `JWKS does not carry a key with kid "${kid}" after a successful refresh; the verifier cannot validate this token's signature.`,
      code: 'cache_miss' as never,
    };
  }

  return { getKey };
}
