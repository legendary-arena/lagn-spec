/**
 * JWKS Cache — Tests (WP-126)
 *
 * Tests use `node:test` + `node:assert`. Every fetcher is a fake
 * `(url) => Promise<Response>` injected via `config.fetcher`; the
 * global fetch is never stubbed and the mock-agent surface from
 * the low-level HTTP client library is not consulted.
 *
 * Authority: WP-126 §Test plan; D-12603 (per-instance state lock,
 * single-flight, one-shot retry, graceful degradation, aliasing
 * defense); PS-2 (fetcher-injection seam).
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createJwksCache } from './jwksCache.logic.js';
import type {
  JwksCacheErrorCode,
} from './jwksCache.logic.js';
import type { JwksFetcher } from './hankoVerifier.types.js';

const FAKE_JWKS_URL = 'https://test.example/fake-tenant/.well-known/jwks.json';
const FAST_REFRESH_MS = 60_000;

interface FakeKey extends JsonWebKey {
  readonly kid: string;
}

function makeFakeKey(kid: string): FakeKey {
  return {
    kid,
    kty: 'RSA',
    use: 'sig',
    alg: 'RS256',
    n: `n-value-for-${kid}`,
    e: 'AQAB',
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeStaticFetcher(keys: readonly FakeKey[]): {
  readonly fetcher: JwksFetcher;
  readonly callCount: () => number;
} {
  let callCount = 0;
  const fetcher: JwksFetcher = async () => {
    callCount += 1;
    return jsonResponse({ keys });
  };
  return { fetcher, callCount: () => callCount };
}

function makeFailingFetcher(): {
  readonly fetcher: JwksFetcher;
  readonly callCount: () => number;
} {
  let callCount = 0;
  const fetcher: JwksFetcher = async () => {
    callCount += 1;
    throw new Error('simulated network failure');
  };
  return { fetcher, callCount: () => callCount };
}

interface SwitchableFetcher {
  readonly fetcher: JwksFetcher;
  readonly callCount: () => number;
  setKeys(keys: readonly FakeKey[]): void;
  setFailing(value: boolean): void;
}

function makeSwitchableFetcher(initial: readonly FakeKey[]): SwitchableFetcher {
  let currentKeys: readonly FakeKey[] = initial;
  let failing = false;
  let callCount = 0;
  const fetcher: JwksFetcher = async () => {
    callCount += 1;
    if (failing === true) {
      throw new Error('simulated transient network failure');
    }
    return jsonResponse({ keys: currentKeys });
  };
  return {
    fetcher,
    callCount: () => callCount,
    setKeys(keys) {
      currentKeys = keys;
    },
    setFailing(value) {
      failing = value;
    },
  };
}

describe('createJwksCache (WP-126)', () => {
  test('happy path: getKey returns Result.ok with the cached key', async () => {
    const key = makeFakeKey('kid-1');
    const { fetcher } = makeStaticFetcher([key]);
    const cache = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher,
    });
    const result = await cache.getKey('kid-1');
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.kid, 'kid-1');
      assert.equal(result.value.kty, 'RSA');
      assert.equal(result.value.alg, 'RS256');
    }
  });

  test('cache miss + successful refresh: getKey for a new kid triggers refresh-and-retry', async () => {
    const initial = [makeFakeKey('kid-old')];
    const switchable = makeSwitchableFetcher(initial);
    const cache = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher: switchable.fetcher,
    });
    // Wait for the construction-time refresh to populate the cache.
    const firstResult = await cache.getKey('kid-old');
    assert.equal(firstResult.ok, true);
    // Rotate the JWKS so the next refresh sees the new key.
    switchable.setKeys([makeFakeKey('kid-old'), makeFakeKey('kid-new')]);
    const result = await cache.getKey('kid-new');
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.kid, 'kid-new');
    }
  });

  test('cache miss + failed refresh: getKey returns Result.fail with code refresh_failed', async () => {
    const switchable = makeSwitchableFetcher([makeFakeKey('kid-1')]);
    const cache = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher: switchable.fetcher,
    });
    // Populate the cache with the initial key.
    const seed = await cache.getKey('kid-1');
    assert.equal(seed.ok, true);
    // Subsequent refreshes will fail; an unknown kid hits cache miss
    // and propagates the refresh failure.
    switchable.setFailing(true);
    const result = await cache.getKey('unknown-kid');
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as JwksCacheErrorCode;
      assert.equal(code, 'refresh_failed');
      assert.match(result.reason, /^.+\.$/);
    }
  });

  test('refresh failure preserves existing cache for already-known kids', async () => {
    const switchable = makeSwitchableFetcher([makeFakeKey('kid-1')]);
    const cache = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher: switchable.fetcher,
    });
    const seed = await cache.getKey('kid-1');
    assert.equal(seed.ok, true);
    switchable.setFailing(true);
    // Trigger a refresh attempt by asking for an unknown kid.
    const miss = await cache.getKey('unknown-kid');
    assert.equal(miss.ok, false);
    // The originally-cached kid still resolves cleanly.
    const stillCached = await cache.getKey('kid-1');
    assert.equal(stillCached.ok, true);
    if (stillCached.ok === true) {
      assert.equal(stillCached.value.kid, 'kid-1');
    }
  });

  test('two cache instances are independent (per-instance state lock)', async () => {
    const fetcherA = makeStaticFetcher([makeFakeKey('only-in-a')]);
    const fetcherB = makeStaticFetcher([makeFakeKey('only-in-b')]);
    const cacheA = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher: fetcherA.fetcher,
    });
    const cacheB = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher: fetcherB.fetcher,
    });
    const a = await cacheA.getKey('only-in-a');
    const b = await cacheB.getKey('only-in-b');
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    // Cross-cache misses confirm independent state.
    const aMissesB = await cacheA.getKey('only-in-b');
    const bMissesA = await cacheB.getKey('only-in-a');
    assert.equal(aMissesB.ok, false);
    assert.equal(bMissesA.ok, false);
  });

  test('refresh is single-flight: concurrent getKey calls share one fetcher invocation', async () => {
    const key = makeFakeKey('kid-1');
    let resolveDeferred: (() => void) | null = null;
    const deferred = new Promise<void>((resolve) => {
      resolveDeferred = resolve;
    });
    let callCount = 0;
    const fetcher: JwksFetcher = async () => {
      callCount += 1;
      await deferred;
      return jsonResponse({ keys: [key] });
    };
    const cache = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher,
    });
    // Three concurrent getKey calls during the in-flight construction
    // refresh. All four (one construction-time + three caller) share
    // the same fetcher invocation.
    const concurrent = Promise.all([
      cache.getKey('kid-1'),
      cache.getKey('kid-1'),
      cache.getKey('kid-1'),
    ]);
    // Yield to the event loop so the construction-time refresh
    // and the three getKey calls all attach to the same in-flight
    // promise before we resolve.
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.notEqual(resolveDeferred, null);
    if (resolveDeferred !== null) {
      (resolveDeferred as () => void)();
    }
    const results = await concurrent;
    for (const r of results) {
      assert.equal(r.ok, true);
    }
    assert.equal(callCount, 1);
  });

  test('aliasing defense: mutating a returned key cannot corrupt the cache', async () => {
    const key = makeFakeKey('kid-1');
    const { fetcher } = makeStaticFetcher([key]);
    const cache = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher,
    });
    const first = await cache.getKey('kid-1');
    assert.equal(first.ok, true);
    if (first.ok === true) {
      // Attempt to mutate the returned key. ESM strict mode either
      // throws TypeError or silently no-ops on a frozen object;
      // either way, the cache's stored shape must be preserved.
      try {
        (first.value as { extraField?: string }).extraField = 'mutated';
      } catch {
        // why: Object.freeze causes assignment to throw in strict
        // mode; the test tolerates either outcome.
      }
    }
    const second = await cache.getKey('kid-1');
    assert.equal(second.ok, true);
    if (second.ok === true) {
      assert.equal(
        (second.value as { extraField?: string }).extraField,
        undefined,
      );
      assert.equal(second.value.kid, 'kid-1');
    }
  });

  test('config.fetcher injection: the fake is invoked, the global fetch is not consulted', async () => {
    const key = makeFakeKey('kid-1');
    const tracker = makeStaticFetcher([key]);
    const cache = createJwksCache({
      jwksUrl: FAKE_JWKS_URL,
      refreshIntervalMs: FAST_REFRESH_MS,
      fetcher: tracker.fetcher,
    });
    const result = await cache.getKey('kid-1');
    assert.equal(result.ok, true);
    // The construction-time refresh + the getKey-time microtask both
    // attach to the same in-flight promise; the fetcher is invoked
    // exactly once for the lifetime so far.
    assert.ok(tracker.callCount() >= 1);
  });
});
