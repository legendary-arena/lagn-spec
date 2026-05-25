// why: jsdom globals must be installed before Vue's mount() is called.
import '../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defineComponent, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthNav, type AuthNavState } from './useAuthNav';
import { useAuthStore } from '../stores/auth';

/**
 * Mount a minimal wrapper component that calls useAuthNav() in setup,
 * providing proper inject context and Pinia.
 */
function mountAuthNav(options?: {
  isBootstrapping?: boolean;
  token?: string | null;
}): { state: AuthNavState; pinia: ReturnType<typeof createPinia> } {
  const pinia = createPinia();
  setActivePinia(pinia);

  if (options?.token !== undefined && options.token !== null) {
    useAuthStore().setSession(options.token, null);
  }

  let captured!: AuthNavState;

  const TestHost = defineComponent({
    setup() {
      captured = useAuthNav();
      return { captured };
    },
    template: '<div />',
  });

  mount(TestHost, {
    global: {
      plugins: [pinia],
      provide: {
        isAuthBootstrapping: ref(options?.isBootstrapping ?? false),
      },
    },
  });

  return { state: captured, pinia };
}

describe('useAuthNav (WP-175)', () => {
  test('bootstrapping state: isBootstrapping is true when provided as true', () => {
    const { state } = mountAuthNav({ isBootstrapping: true });
    assert.equal(state.isBootstrapping.value, true);
  });

  test('bootstrapping state: displayLabel is "My account" regardless of auth', () => {
    const { state } = mountAuthNav({ isBootstrapping: true, token: 'tok-1' });
    assert.equal(state.displayLabel.value, 'My account');
  });

  test('signed-out state: isSignedIn is false when no token is set', () => {
    const { state } = mountAuthNav({ isBootstrapping: false });
    assert.equal(state.isSignedIn.value, false);
  });

  test('signed-out state: displayLabel is "My account" when signed out', () => {
    const { state } = mountAuthNav({ isBootstrapping: false });
    assert.equal(state.displayLabel.value, 'My account');
  });

  test('signed-in state: isSignedIn is true when a token is present', () => {
    const { state } = mountAuthNav({ token: 'tok-abc' });
    assert.equal(state.isSignedIn.value, true);
  });

  test('signed-in state: displayLabel is "My account" (Amendment 1 — fetch deferred)', () => {
    const { state } = mountAuthNav({ token: 'tok-abc' });
    assert.equal(state.displayLabel.value, 'My account');
  });

  test('isBootstrapping defaults to true when no provide is injected', () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    let captured!: AuthNavState;

    const TestHost = defineComponent({
      setup() {
        captured = useAuthNav();
        return {};
      },
      template: '<div />',
    });

    // Mount WITHOUT providing isAuthBootstrapping — the inject default
    // ref(true) should kick in as the fail-safe.
    mount(TestHost, { global: { plugins: [pinia] } });

    assert.equal(captured.isBootstrapping.value, true);
  });

  test('signOut is a function on the returned state', () => {
    const { state } = mountAuthNav({ token: 'tok-signout' });
    assert.equal(typeof state.signOut, 'function');
  });
});
