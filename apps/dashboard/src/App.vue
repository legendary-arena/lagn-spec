<script lang="ts">
// why: module-scoped idempotency guard — declared in a plain `<script>` block so
// it lives at module scope (NOT per-instance like a `<script setup>` binding).
// Hanko init + the session subscription must run AT MOST ONCE per process; a
// repeat mount of the root (HMR in dev, or any future re-mount) MUST NOT re-init
// the broker or double-subscribe, which would fire `setSession`/`clearSession`
// twice per broker event (WP-241 Hanko-init-idempotency Locked Contract Value).
let hankoInitialized = false;

/**
 * Read the Hanko tenant origin from the Vite build-time env. `import.meta.env`
 * is Vite-provided; the dashboard's `env.d.ts` narrows `ImportMetaEnv` to the
 * known vars (no index signature), so the new var is read through a local cast
 * (the same pattern the LIVE fetchers use) rather than widening `env.d.ts`. An
 * empty value routes straight to the LoginPage's unavailable state — see the
 * onMounted guard below.
 */
function readTenantBaseUrl(): string {
  return (
    (import.meta as unknown as { env?: { VITE_HANKO_TENANT_BASE_URL?: string } }).env
      ?.VITE_HANKO_TENANT_BASE_URL ?? ''
  );
}
</script>

<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import VersionBadge from './components/VersionBadge.vue';
import { useAuthStore } from './stores/auth.js';
import { registerAuthTokenReader } from './services/authToken.js';
import {
  getCurrentTokenFromHandle,
  initializeHankoClient,
  subscribeToSessionEvents,
} from './auth/hankoClient.js';

const authStore = useAuthStore();

// why: D-24005 — wire the live token source ONCE, synchronously in setup, after
// Pinia is installed (main.ts calls `app.use(createPinia())` before mounting).
// The plain-module LIVE fetchers resolve the operator token via
// `readAuthToken()` → this reader, never by calling `useAuthStore()` themselves
// (removes the Pinia-timing false-null). Re-registration overwrites with an
// equivalent reader (the Pinia store is a singleton), so this is idempotent.
registerAuthTokenReader(() => authStore.token);

onMounted(() => {
  if (hankoInitialized) {
    return;
  }
  hankoInitialized = true;

  const tenantBaseUrl = readTenantBaseUrl();
  if (tenantBaseUrl === '') {
    // why: no tenant configured (local dev, tests, an unprovisioned deploy) —
    // do NOT init the broker and do NOT throw. The router guard sends an
    // unauthenticated operator to the LoginPage, which renders its own
    // 'unavailable' banner. This is the empty-tenant fall-through.
    return;
  }

  void (async () => {
    try {
      const handle = await initializeHankoClient({ tenantBaseUrl });
      // why: a returning operator may already hold a valid broker cookie; read
      // it on mount so they are recognized as signed-in without re-typing
      // credentials (the store's D-16003 guard ignores a null cached token).
      authStore.bootstrapFromCachedToken(getCurrentTokenFromHandle(handle));
      subscribeToSessionEvents(handle, {
        onSessionCreated: (token) => {
          authStore.setSession(token, null);
        },
        onSessionExpired: () => {
          authStore.clearSession();
        },
        onUserLoggedOut: () => {
          authStore.clearSession();
        },
      });
    } catch {
      // why: a broker init failure (network, bundle load, tenant unreachable)
      // must NEVER throw to the operator. The wrapper already swallowed the
      // underlying detail (no tenant/transport leak, D-16009); the router guard
      // keeps an unauthenticated operator on the LoginPage, which shows its own
      // 'unavailable' banner — the analogue of the empty-tenant path above for
      // the unreachable-tenant case.
    }
  })();
});
</script>

<template>
  <RouterView />
  <VersionBadge />
</template>
