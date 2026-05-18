import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HankoInitializationFailed,
  getCurrentTokenFromHandle,
  initializeHankoClient,
  signOutCurrentSession,
  subscribeToSessionEvents,
  type HankoLike,
} from './hankoClient';

// why: the wrapper's `__hankoFactory` test seam keeps `@teamhanko/*` out
// of the test bundle entirely — the real package registers browser-only
// custom elements at module load, which crashes under node:test + jsdom.
// Only `import type` declarations from the wrapper itself are used here;
// no runtime broker code is loaded.

/**
 * Build a fake broker handle. Tests pass overrides per case; any
 * unspecified method throws if invoked unexpectedly — a stronger
 * guarantee than silently returning `undefined`.
 */
function makeFakeHanko(overrides: Partial<HankoLike>): HankoLike {
  return {
    getSessionToken:
      overrides.getSessionToken ??
      (() => {
        throw new Error(
          'Fake getSessionToken called unexpectedly — the test did not stub this method.',
        );
      }),
    logout:
      overrides.logout ??
      (async () => {
        throw new Error(
          'Fake logout called unexpectedly — the test did not stub this method.',
        );
      }),
    onSessionCreated:
      overrides.onSessionCreated ??
      (() => {
        throw new Error(
          'Fake onSessionCreated called unexpectedly — the test did not stub this method.',
        );
      }),
    onSessionExpired:
      overrides.onSessionExpired ??
      (() => {
        throw new Error(
          'Fake onSessionExpired called unexpectedly — the test did not stub this method.',
        );
      }),
    onUserLoggedOut:
      overrides.onUserLoggedOut ??
      (() => {
        throw new Error(
          'Fake onUserLoggedOut called unexpectedly — the test did not stub this method.',
        );
      }),
  };
}

test('initializeHankoClient resolves to a handle wrapping the broker SDK', async () => {
  const fake = makeFakeHanko({ getSessionToken: () => 'jwt-abc' });
  const handle = await initializeHankoClient({
    tenantBaseUrl: 'https://example.test',
    __hankoFactory: async () => fake,
  });
  assert.equal(getCurrentTokenFromHandle(handle), 'jwt-abc');
});

test('factory rejection raises HankoInitializationFailed with no leaked detail', async () => {
  await assert.rejects(
    async () => {
      await initializeHankoClient({
        tenantBaseUrl: 'https://example.test',
        __hankoFactory: async () => {
          throw new Error(
            'network down: tenant unreachable at https://example.test',
          );
        },
      });
    },
    (err: unknown) => {
      assert.ok(
        err instanceof HankoInitializationFailed,
        'expected HankoInitializationFailed instance',
      );
      const message = (err as Error).message;
      assert.equal(
        message.includes('network down'),
        false,
        'underlying error text must not leak through the typed error',
      );
      assert.equal(
        message.includes('example.test'),
        false,
        'tenant URL must not leak through the typed error',
      );
      return true;
    },
  );
});

test('getCurrentTokenFromHandle normalizes a null SDK return to null', async () => {
  const fake = makeFakeHanko({
    getSessionToken: () => null as unknown as string,
  });
  const handle = await initializeHankoClient({
    tenantBaseUrl: 'https://example.test',
    __hankoFactory: async () => fake,
  });
  assert.equal(getCurrentTokenFromHandle(handle), null);
});

test('getCurrentTokenFromHandle normalizes an empty-string SDK return to null', async () => {
  // why: explicitly verify the empty-string case — a future SDK behavior
  // change that returned '' instead of null would otherwise leak an
  // empty bearer header to API clients and surface as a confusing 401.
  const fake = makeFakeHanko({ getSessionToken: () => '' });
  const handle = await initializeHankoClient({
    tenantBaseUrl: 'https://example.test',
    __hankoFactory: async () => fake,
  });
  assert.equal(getCurrentTokenFromHandle(handle), null);
});

test('signOutCurrentSession invokes hanko.logout() exactly once', async () => {
  let logoutCalls = 0;
  const fake = makeFakeHanko({
    logout: async () => {
      logoutCalls += 1;
    },
  });
  const handle = await initializeHankoClient({
    tenantBaseUrl: 'https://example.test',
    __hankoFactory: async () => fake,
  });
  await signOutCurrentSession(handle);
  assert.equal(logoutCalls, 1);
});

test('signOutCurrentSession propagates the SDK rejection to the caller', async () => {
  const fake = makeFakeHanko({
    logout: async () => {
      throw new Error('broker down');
    },
  });
  const handle = await initializeHankoClient({
    tenantBaseUrl: 'https://example.test',
    __hankoFactory: async () => fake,
  });
  await assert.rejects(
    async () => {
      await signOutCurrentSession(handle);
    },
    /broker down/,
  );
});

test('subscribeToSessionEvents registers all three broker listeners exactly once each', async () => {
  let createdRegistrations = 0;
  let expiredRegistrations = 0;
  let loggedOutRegistrations = 0;
  const fake = makeFakeHanko({
    onSessionCreated: (cb) => {
      createdRegistrations += 1;
      assert.equal(typeof cb, 'function');
      return () => {};
    },
    onSessionExpired: (cb) => {
      expiredRegistrations += 1;
      assert.equal(typeof cb, 'function');
      return () => {};
    },
    onUserLoggedOut: (cb) => {
      loggedOutRegistrations += 1;
      assert.equal(typeof cb, 'function');
      return () => {};
    },
  });
  const handle = await initializeHankoClient({
    tenantBaseUrl: 'https://example.test',
    __hankoFactory: async () => fake,
  });
  subscribeToSessionEvents(handle, {
    onSessionCreated: () => {},
    onSessionExpired: () => {},
    onUserLoggedOut: () => {},
  });
  assert.equal(createdRegistrations, 1);
  assert.equal(expiredRegistrations, 1);
  assert.equal(loggedOutRegistrations, 1);
});

test('onSessionCreated reads getSessionToken at fire time, ignoring the event payload', async () => {
  let registeredCallback: ((detail: unknown) => void) | null = null;
  let getterReads = 0;
  const fake = makeFakeHanko({
    getSessionToken: () => {
      getterReads += 1;
      return 'jwt-from-getter';
    },
    onSessionCreated: (cb) => {
      registeredCallback = cb;
      return () => {};
    },
    onSessionExpired: () => () => {},
    onUserLoggedOut: () => () => {},
  });
  const handle = await initializeHankoClient({
    tenantBaseUrl: 'https://example.test',
    __hankoFactory: async () => fake,
  });
  const consumerReceivedTokens: string[] = [];
  subscribeToSessionEvents(handle, {
    onSessionCreated: (token) => {
      consumerReceivedTokens.push(token);
    },
    onSessionExpired: () => {},
    onUserLoggedOut: () => {},
  });
  assert.notEqual(registeredCallback, null);
  // why: invoke the broker-side listener with an arbitrary fake event
  // payload. The wrapper MUST ignore the payload and re-read
  // `getSessionToken()` at fire time — verified by the consumer
  // receiving the getter's return value, not the payload string.
  registeredCallback!({
    payload: 'unrelated-event-string',
    claims: { sub: 'irrelevant' },
  });
  assert.equal(consumerReceivedTokens.length, 1);
  assert.equal(consumerReceivedTokens[0], 'jwt-from-getter');
  assert.ok(
    getterReads >= 1,
    'wrapper must call getSessionToken on every session-created fire',
  );
});
