// why: jsdom globals must be installed before Vue's mount() is called.
import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Header from './Header.vue';
import { useAuthStore } from '../../stores/auth';

/**
 * Mount Header.vue with the specified auth context.
 */
function mountHeader(options?: {
  isBootstrapping?: boolean;
  token?: string | null;
}) {
  const pinia = createPinia();
  setActivePinia(pinia);

  if (options?.token !== undefined && options.token !== null) {
    useAuthStore().setSession(options.token, null);
  }

  return mount(Header, {
    global: {
      plugins: [pinia],
      provide: {
        isAuthBootstrapping: ref(options?.isBootstrapping ?? false),
      },
    },
  });
}

describe('BrandHeader auth nav (WP-175)', () => {
  describe('bootstrapping state', () => {
    test('renders the "..." placeholder with data-testid auth-nav-bootstrapping', () => {
      const wrapper = mountHeader({ isBootstrapping: true });
      const placeholder = wrapper.find('[data-testid="auth-nav-bootstrapping"]');
      assert.equal(placeholder.exists(), true);
      assert.equal(placeholder.text(), '...');
    });

    test('does not render sign-in or signed-in elements during bootstrap', () => {
      const wrapper = mountHeader({ isBootstrapping: true, token: 'tok-1' });
      assert.equal(
        wrapper.find('[data-testid="auth-nav-sign-in"]').exists(),
        false,
      );
      assert.equal(
        wrapper.find('[data-testid="auth-nav-display"]').exists(),
        false,
      );
      assert.equal(
        wrapper.find('[data-testid="auth-nav-sign-out"]').exists(),
        false,
      );
    });
  });

  describe('signed-out state', () => {
    test('renders a "Sign in" link targeting ?route=login', () => {
      const wrapper = mountHeader({ isBootstrapping: false });
      const signIn = wrapper.find('[data-testid="auth-nav-sign-in"]');
      assert.equal(signIn.exists(), true);
      assert.equal(signIn.text(), 'Sign in');
      assert.equal(signIn.attributes('href'), '?route=login');
    });

    test('does not render signed-in or bootstrapping elements', () => {
      const wrapper = mountHeader({ isBootstrapping: false });
      assert.equal(
        wrapper.find('[data-testid="auth-nav-bootstrapping"]').exists(),
        false,
      );
      assert.equal(
        wrapper.find('[data-testid="auth-nav-display"]').exists(),
        false,
      );
      assert.equal(
        wrapper.find('[data-testid="auth-nav-sign-out"]').exists(),
        false,
      );
    });
  });

  describe('signed-in state', () => {
    test('renders the display label with data-testid auth-nav-display', () => {
      const wrapper = mountHeader({ token: 'tok-abc' });
      const display = wrapper.find('[data-testid="auth-nav-display"]');
      assert.equal(display.exists(), true);
      assert.equal(display.text(), 'My account');
    });

    test('renders a "My profile" link targeting ?route=me', () => {
      const wrapper = mountHeader({ token: 'tok-abc' });
      const profileLink = wrapper.find('[data-testid="auth-nav-profile-link"]');
      assert.equal(profileLink.exists(), true);
      assert.equal(profileLink.text(), 'My profile');
      assert.equal(profileLink.attributes('href'), '?route=me');
    });

    test('renders a "Sign out" button', () => {
      const wrapper = mountHeader({ token: 'tok-abc' });
      const signOutButton = wrapper.find('[data-testid="auth-nav-sign-out"]');
      assert.equal(signOutButton.exists(), true);
      assert.equal(signOutButton.text(), 'Sign out');
    });

    test('does not render sign-in or bootstrapping elements when signed in', () => {
      const wrapper = mountHeader({ token: 'tok-abc' });
      assert.equal(
        wrapper.find('[data-testid="auth-nav-sign-in"]').exists(),
        false,
      );
      assert.equal(
        wrapper.find('[data-testid="auth-nav-bootstrapping"]').exists(),
        false,
      );
    });

    test('sign-out button is a clickable element', () => {
      const wrapper = mountHeader({ token: 'tok-abc' });
      const signOutButton = wrapper.find('[data-testid="auth-nav-sign-out"]');
      assert.equal(signOutButton.element.tagName, 'BUTTON');
      assert.equal(signOutButton.attributes('type'), 'button');
    });
  });
});
