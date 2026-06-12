/**
 * Pinia Auth Store — canonical operator-side bearer token (WP-241).
 *
 * The store holds the bearer token plus an optional `accountId` lag-field;
 * `isAuthenticated` is a derived `ComputedRef<boolean>` (never a
 * separately-settable ref) so the store cannot drift into a state where
 * `token === null` but `isAuthenticated === true` (or vice versa).
 *
 * This store is the canonical client-side source of truth for the operator's
 * bearer token: `App.vue` populates it from the authentication broker via the
 * SDK wrapper under `../auth/`, the router guard gates on its `isAuthenticated`,
 * and the LIVE fetchers read the token through the `readAuthToken()` accessor
 * (registered once in `App.vue`) — never by importing this store directly.
 *
 * It replaces the prior mock store (`login(AuthUser)` with a fabricated role).
 * Mirrors the arena-client WP-160 store; the dashboard keeps its own copy
 * (Layer Boundary forbids importing across `apps/*`).
 *
 * Authority: WP-241 §B (Auth store contract); D-16003 (the bootstrap null-guard);
 * D-24005 (token lives only here; fetchers read it via the registered accessor).
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { defineStore } from 'pinia';

/**
 * Composition-API Pinia store for the authenticated operator session. Returns a
 * store exposing reactive `token` / `accountId` refs, the derived
 * `isAuthenticated` boolean, and the three session-mutation actions.
 *
 * @returns A Pinia store with auth-session state and actions.
 */
export const useAuthStore = defineStore('auth', () => {
  const token: Ref<string | null> = ref(null);
  const accountId: Ref<string | null> = ref(null);

  const isAuthenticated: ComputedRef<boolean> = computed(() => token.value !== null);

  /**
   * Record a successful sign-in or session bootstrap. Replaces both the bearer
   * token and the optional account-id lag-field. Callers from the sign-in flow
   * pass `accountId === null` — the server-provisioned `ext_id` only surfaces on
   * the first authenticated profile call, and no current consumer reads
   * `accountId`. A future caller can pass it through here without changing the
   * store shape.
   *
   * @param nextToken The bearer token to attach to outbound API calls.
   * @param nextAccountId The server-provisioned `ext_id`, or `null` if not yet
   *                      known.
   */
  function setSession(nextToken: string, nextAccountId: string | null): void {
    token.value = nextToken;
    accountId.value = nextAccountId;
  }

  /**
   * Clear both the bearer token and the account-id. Used on sign-out and on
   * broker-reported session expiry. Idempotent — calling against an
   * already-cleared store leaves the state at its initial values.
   */
  function clearSession(): void {
    token.value = null;
    accountId.value = null;
  }

  /**
   * Populate the store from a token previously cached by the broker (the
   * broker's cookie surviving a page reload). A `null` argument is a no-op.
   *
   * @param cachedToken The cached token from the broker, or `null` if no cached
   *                    session is present.
   */
  function bootstrapFromCachedToken(cachedToken: string | null): void {
    // why: D-16003 — a null cached token MUST NOT clobber a session set earlier
    // by an in-flight sign-in handshake. The LoginPage's onSessionCreated path
    // calls setSession() before App.vue's bootstrap completes; if the bootstrap
    // then cleared an already-set token, the operator would appear signed-out
    // for the first render after sign-in.
    if (cachedToken === null) {
      return;
    }
    token.value = cachedToken;
  }

  return {
    token,
    accountId,
    isAuthenticated,
    setSession,
    clearSession,
    bootstrapFromCachedToken,
  };
});
