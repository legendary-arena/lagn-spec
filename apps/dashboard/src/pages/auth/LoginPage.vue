<script setup lang="ts">
/**
 * Operator sign-in surface for the dashboard SPA (WP-241).
 *
 * Mounts the broker-provided `<hanko-auth>` custom element when the SDK
 * initialization succeeds, surfaces a static banner when it doesn't, and on a
 * successful sign-in event populates the Pinia auth store and navigates to the
 * originally-requested route (the `?redirect=` query the router guard set).
 *
 * This page does NOT import the broker SDK directly — every broker surface goes
 * through the wrapper under `../../auth/`, mirroring the arena-client LoginPage.
 * It replaces the prior mock email/role form.
 */
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import {
  getCurrentTokenFromHandle,
  initializeHankoClient,
  subscribeToSessionEvents,
  type HankoClientHandle,
} from '../../auth/hankoClient.js';

type LoginPageState = 'initializing' | 'ready' | 'unavailable';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const state = ref<LoginPageState>('initializing');

function readTenantBaseUrl(): string {
  // why: `import.meta.env` is Vite-provided; the dashboard's `env.d.ts` narrows
  // `ImportMetaEnv` (no index signature), so the new var is read through a local
  // cast — the same pattern the LIVE fetchers use — rather than widening
  // `env.d.ts`. An empty value routes to the static 'unavailable' banner.
  return (
    (import.meta as unknown as { env?: { VITE_HANKO_TENANT_BASE_URL?: string } }).env
      ?.VITE_HANKO_TENANT_BASE_URL ?? ''
  );
}

const tenantBaseUrl = readTenantBaseUrl();
let handle: HankoClientHandle | null = null;

async function handleSignIn(): Promise<void> {
  if (handle === null) {
    state.value = 'unavailable';
    return;
  }
  const token = getCurrentTokenFromHandle(handle);
  if (token === null) {
    // Defensive: onSessionCreated fired but the SDK reports no token. Surface
    // the banner so the operator can retry rather than silently spinning.
    state.value = 'unavailable';
    return;
  }
  authStore.setSession(token, null);
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/overview';
  await router.push(redirect);
}

onMounted(async () => {
  if (tenantBaseUrl === '') {
    state.value = 'unavailable';
    return;
  }
  try {
    handle = await initializeHankoClient({ tenantBaseUrl });
  } catch {
    // why: a broker init failure must surface the static 'unavailable' banner,
    // not throw — the underlying detail is already swallowed inside the wrapper
    // (D-16009). The operator sees a generic retry message, no transport leak.
    state.value = 'unavailable';
    return;
  }
  subscribeToSessionEvents(handle, {
    onSessionCreated: () => {
      void handleSignIn();
    },
    onSessionExpired: () => {
      // why: on the sign-in page itself an expiry event is a no-op — the
      // operator has not yet completed sign-in here. App.vue's global
      // subscription clears the store on expiry for guarded routes.
    },
    onUserLoggedOut: () => {
      // why: same rationale as onSessionExpired — logout state is not managed
      // on the sign-in page.
    },
  });
  state.value = 'ready';
});
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1>Legendary Arena</h1>
      <p class="subtitle">Admin Dashboard</p>

      <template v-if="state === 'initializing'">
        <p class="login-status" data-testid="login-initializing">Preparing sign-in…</p>
      </template>

      <template v-else-if="state === 'ready'">
        <div class="login-widget" data-testid="login-widget">
          <hanko-auth :api="tenantBaseUrl"></hanko-auth>
        </div>
      </template>

      <template v-else>
        <p class="login-banner" data-testid="login-unavailable">
          Sign-in is temporarily unavailable. Please try again later.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f1f5f9;
}

.login-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 2.5rem;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.login-card h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #0f172a;
}

.subtitle {
  color: #64748b;
  margin: 0.25rem 0 2rem;
  font-size: 0.9rem;
}

.login-status {
  font-size: 0.9rem;
  color: #64748b;
}

.login-widget {
  min-height: 18rem;
}

.login-banner {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #fff4e6;
  border: 1px solid #f4a261;
  border-radius: 6px;
  color: #0f172a;
}
</style>
