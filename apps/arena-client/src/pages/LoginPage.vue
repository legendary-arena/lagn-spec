<script lang="ts">
/**
 * Sign-in surface for the arena-client SPA (WP-160).
 *
 * Mounts the broker-provided sign-in custom element when the SDK
 * initialization succeeds, surfaces a static failure banner when it
 * doesn't, and on a successful sign-in event populates the Pinia
 * auth store and full-reloads to the originally-requested guarded
 * route (D-16008).
 *
 * The page does NOT import the broker SDK directly — every broker
 * surface goes through the wrapper under `../auth/`, per the broker
 * confinement discipline (F-2 extended to the client).
 *
 * Authority: WP-160 §E (LoginPage contract); D-16008 (sign-in surface
 * placement at `?route=login`); D-16009 (failure-mode surfacing).
 */
import { defineComponent, onMounted, ref } from 'vue';

import {
  HankoInitializationFailed,
  getCurrentTokenFromHandle,
  initializeHankoClient,
  subscribeToSessionEvents,
  type HankoClientHandle,
} from '../auth/hankoClient';
import { useAuthStore } from '../stores/auth';

type LoginPageState =
  | 'initializing'
  | 'ready'
  | 'unavailable'
  | 'signing-out';

const GUARDED_RETURN_ROUTES = ['me', 'admin-billing'] as const;
type GuardedReturnRoute = (typeof GUARDED_RETURN_ROUTES)[number];

function isGuardedReturnRoute(
  value: string | null,
): value is GuardedReturnRoute {
  if (value === null) {
    return false;
  }
  return (GUARDED_RETURN_ROUTES as readonly string[]).includes(value);
}

function readTenantBaseUrl(): string {
  // why: import.meta.env is Vite-provided; under the node:test runner
  // there is no Vite transform, so the property may be undefined.
  // Optional chaining keeps this safe and the empty-string default
  // routes to the static 'unavailable' banner via the onMounted gate.
  const value = (import.meta.env?.VITE_HANKO_TENANT_BASE_URL ?? '') as string;
  return value;
}

export default defineComponent({
  name: 'LoginPage',
  props: {
    returnTo: {
      type: String as () => string | null,
      default: null,
    },
  },
  setup(props) {
    // why: closed-set validation. A stale or attacker-supplied
    // `?returnTo=` value MUST NOT navigate the user to an unknown
    // route. Only the two guarded routes the App.vue route-guard could
    // have requested (`me`, `admin-billing`) are accepted; anything
    // else falls back to lobby (`?route=`) on sign-in success.
    const validatedReturnTo: GuardedReturnRoute | null =
      isGuardedReturnRoute(props.returnTo) ? props.returnTo : null;
    const state = ref<LoginPageState>('initializing');
    const tenantBaseUrl = readTenantBaseUrl();
    let handle: HankoClientHandle | null = null;

    async function handleSignIn(): Promise<void> {
      if (handle === null) {
        state.value = 'unavailable';
        return;
      }
      const token = getCurrentTokenFromHandle(handle);
      if (token === null) {
        // Defensive: onSessionCreated fired but the SDK reports no
        // token. Should not happen in practice; surface the failure
        // banner so the player can retry rather than silently spinning.
        state.value = 'unavailable';
        return;
      }
      const auth = useAuthStore();
      auth.setSession(token, null);
      // why: window.location.assign(...) is a full reload, not a
      // pushState navigation. The target guarded route's bootstrap
      // re-runs App.vue's setup, which calls initializeHankoClient
      // again and reads the just-set broker cookie via
      // getSessionToken(). A pushState navigation would keep the same
      // Vue app instance; the cached route value would not refresh and
      // the user would still see the LoginPage.
      window.location.assign('?route=' + (validatedReturnTo ?? ''));
    }

    onMounted(async () => {
      if (tenantBaseUrl === '') {
        state.value = 'unavailable';
        if (typeof console !== 'undefined' && import.meta.env?.DEV === true) {
          // why: [auth]-tagged warn with a single category token only.
          // No tenant URL, no payload — failure detail belongs in the
          // operator dashboard, not the player's console (D-16009).
          console.warn('[auth]', 'tenant-base-url-missing');
        }
        return;
      }
      try {
        handle = await initializeHankoClient({ tenantBaseUrl });
      } catch (err) {
        state.value = 'unavailable';
        if (typeof console !== 'undefined') {
          // why: typed-vs-untyped error category only — the underlying
          // detail is already swallowed inside the wrapper per D-16009.
          console.warn(
            '[auth]',
            err instanceof HankoInitializationFailed
              ? 'init-failed'
              : 'init-failed-unknown',
          );
        }
        return;
      }
      subscribeToSessionEvents(handle, {
        onSessionCreated: () => {
          void handleSignIn();
        },
        onSessionExpired: () => {
          // why: on the sign-in page itself, an expiry event is a
          // no-op — the user has not yet completed sign-in here. The
          // App.vue subscription is responsible for clearing the store
          // on guarded routes when expiry fires there.
        },
        onUserLoggedOut: () => {
          // why: same rationale as onSessionExpired — the sign-in page
          // is not where logout state is managed (D-16004; sign-out
          // affordance lives on MyProfilePage.vue).
        },
      });
      state.value = 'ready';
    });

    return {
      state,
      tenantBaseUrl,
    };
  },
});
</script>

<template>
  <article
    class="login-page"
    data-testid="login-page-root"
    :data-state="state"
  >
    <header class="login-page-header">
      <h1>Sign in to Legendary Arena</h1>
    </header>

    <template v-if="state === 'initializing'">
      <p class="login-page-status" data-testid="login-page-initializing">
        Preparing sign-in…
      </p>
    </template>

    <template v-else-if="state === 'ready'">
      <div class="login-page-widget" data-testid="login-page-widget">
        <hanko-auth :api="tenantBaseUrl"></hanko-auth>
      </div>
    </template>

    <template v-else-if="state === 'unavailable'">
      <p class="login-page-banner" data-testid="login-page-unavailable">
        Sign-in is temporarily unavailable. Please try again later.
      </p>
    </template>
  </article>
</template>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  max-width: 32rem;
  margin: 0 auto;
}

.login-page-header h1 {
  font-size: 1.5rem;
  margin: 0;
}

.login-page-status,
.login-page-banner {
  font-size: 0.95rem;
}

.login-page-banner {
  padding: 0.75rem 1rem;
  background: #fff4e6;
  border: 1px solid #f4a261;
  border-radius: 0.25rem;
}

.login-page-widget {
  min-height: 18rem;
}
</style>
