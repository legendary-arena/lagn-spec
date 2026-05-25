/**
 * Auth-aware navigation composable (WP-175).
 *
 * Encapsulates the reactive state for the BrandHeader's auth-aware nav
 * section: sign-in/sign-out state, bootstrapping detection, display
 * label, and the sign-out action.
 *
 * Amendment 1 (2026-05-25): the display label is always "My account"
 * because GET /api/me/profile does not return handle, displayName, or
 * email. A follow-up WP will add those fields to the server response
 * and wire the fallback chain (displayName → handle → email local-part
 * → "My account").
 */

import { computed, inject, ref, type ComputedRef, type Ref } from 'vue';

import {
  initializeHankoClient,
  signOutCurrentSession,
  type HankoClientHandle,
} from '../auth/hankoClient';
import { useAuthStore } from '../stores/auth';

/** Reactive return shape of the auth-nav composable. */
export interface AuthNavState {
  readonly isSignedIn: ComputedRef<boolean>;
  readonly isBootstrapping: Ref<boolean>;
  readonly displayLabel: Ref<string>;
  readonly signOut: () => Promise<void>;
}

// why: module-scoped lazy initializer mirrors MyProfilePage.vue's
// ensureHankoHandle pattern. The Hanko SDK initialization is expensive
// and idempotent; memoizing avoids racing with App.vue's bootstrap.
let cachedHankoHandle: Promise<HankoClientHandle> | null = null;

/**
 * Lazily initialize the broker SDK, memoizing the resulting handle.
 *
 * @returns Promise resolving to the broker SDK handle.
 */
function ensureHankoHandle(): Promise<HankoClientHandle> {
  if (cachedHankoHandle === null) {
    const tenantBaseUrl =
      (import.meta.env?.VITE_HANKO_TENANT_BASE_URL ?? '') as string;
    cachedHankoHandle = initializeHankoClient({ tenantBaseUrl });
  }
  return cachedHankoHandle;
}

/**
 * Composable providing auth-aware navigation state for the BrandHeader.
 *
 * @returns Reactive auth-nav state: sign-in status, bootstrapping flag,
 *          display label, and sign-out action.
 */
export function useAuthNav(): AuthNavState {
  const authStore = useAuthStore();

  const isSignedIn: ComputedRef<boolean> = computed(
    () => authStore.isAuthenticated,
  );

  // why: isAuthBootstrapping is provided via Vue provide/inject (D-17501),
  // NOT stored in the Pinia auth store. The ref(true) default is fail-safe:
  // if the provide is missing, the nav renders the bootstrapping placeholder
  // rather than flashing the signed-out state.
  const isBootstrapping = inject('isAuthBootstrapping', ref(true));

  // why: always "My account" until a follow-up WP adds handle/displayName
  // to the /api/me/profile server response. The fetch and fallback chain
  // (displayName → handle → email local-part → "My account") are deferred.
  // See WP-175 Amendment 1.
  const displayLabel: Ref<string> = ref('My account');

  /**
   * Sign out the current user. Mirrors the MyProfilePage.vue sign-out
   * flow byte-for-byte: broker logout (try) → store clear (always) →
   * navigate to lobby (always).
   */
  async function signOut(): Promise<void> {
    try {
      const handle = await ensureHankoHandle();
      await signOutCurrentSession(handle);
    } catch {
      // why: if the broker logout call fails (network down, broker
      // unreachable, SDK initialization failure), clear the local
      // store and navigate to lobby anyway. A stuck sign-in state is
      // worse than a stale-cookie state: the cookie may persist on
      // the client, but the next page load will re-detect it via
      // App.vue's guarded-route bootstrap and re-route through
      // sign-in if the session has actually been invalidated
      // server-side. This is the fail-safe path (D-16004).
    }
    useAuthStore().clearSession();
    if (typeof window !== 'undefined') {
      window.location.assign('?route=');
    }
  }

  return {
    isSignedIn,
    isBootstrapping,
    displayLabel,
    signOut,
  };
}
