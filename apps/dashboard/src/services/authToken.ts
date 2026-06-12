import type { Ref } from 'vue';
import type { ServiceResponse } from '../types/index.js';

// ============================================================================
// WP-241 / EC-272 / D-24005 — the single live-fetch auth seam.
//
// The three plain-module LIVE fetchers (analytics / sweep / triage) attach the
// operator's Hanko bearer token to every request through THIS module. It is the
// SOLE producer of live-fetch request options (`buildLiveRequestOptions`) and
// the SOLE fail-silent path when no token is present (`handleMissingAuthToken`)
// so the header shape + skip logic can never drift between the three fetchers.
//
// The token itself lives ONLY in the Pinia auth store (D-24005); this module
// never copies or caches it. It reaches the store through a reader function
// registered ONCE from `App.vue` after Pinia is created — see
// `registerAuthTokenReader` below.
// ============================================================================

// why: D-24005 — the live token source is wired in by an explicit
// `registerAuthTokenReader(fn)` call from `App.vue` AFTER Pinia is created. The
// plain-module fetchers must NEVER call `useAuthStore()` themselves: a module
// that may be evaluated before the Pinia instance exists (or under the
// `node --import tsx --test` runner, where there is no Pinia at all) would bind
// to no/another Pinia instance and resolve a false-null token. Reading through
// this registered accessor removes that timing hazard and keeps the fetchers
// decoupled from Vue/Pinia and fully test-injectable.
let authTokenReader: (() => string | null) | null = null;

/**
 * Wire the live token source. Called ONCE from `App.vue` after `createPinia()`
 * has run, passing `() => authStore.token`. Re-registration overwrites the
 * previous reader (idempotent from the caller's perspective — `App.vue` only
 * calls it on the root component's setup).
 *
 * @param reader A function returning the current bearer token, or `null` when
 *               no session is active.
 */
export function registerAuthTokenReader(reader: () => string | null): void {
  authTokenReader = reader;
}

/**
 * Resolve the current bearer token via the registered reader. Returns `null`
 * when no reader has been registered yet (pre-mount, or under the test runner)
 * or when the reader itself reports no active session. The synchronous return
 * keeps the LIVE fetchers' synchronous-getter contract intact.
 *
 * @returns The current bearer token, or `null` if unavailable.
 */
export function readAuthToken(): string | null {
  if (authTokenReader === null) {
    return null;
  }
  return authTokenReader();
}

/**
 * Build the request options for a LIVE fetch carrying the operator's bearer
 * token. This is the SOLE producer of live-fetch options across the three
 * fetchers — no per-file header literal is permitted (drift-proof). Note the
 * deliberate ABSENCE of `credentials: 'include'`: the server reads the token
 * exclusively from `Authorization: Bearer` (D-11202) and ignores cookies, so
 * the cookie path is dropped entirely (supersedes D-20601 — see D-24003).
 *
 * @param token A non-null bearer token (callers gate on `readAuthToken()` being
 *              non-null before calling).
 * @returns The `RequestInit` to pass to `fetch` for a live request.
 */
export function buildLiveRequestOptions(token: string): RequestInit {
  return {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Locked warning text emitted (DEV only, once per process) when a LIVE fetch is
 * skipped because no operator bearer token is available yet. Mirrors the
 * fetchers' missing-`VITE_API_BASE_URL` one-shot warning so an operator sees a
 * comparable signal for the missing-token case.
 */
const MISSING_AUTH_TOKEN_WARNING =
  '[dashboard] LIVE fetch skipped: no operator auth token yet; sign in to load live data.';

// why: the warn-once guard is keyed by this constant inside the caller-supplied
// `Set<string>`; a single key makes the warning one-shot per fetcher module
// (each fetcher owns its own `Set`), mirroring the existing
// `hasWarnedAboutMissingBaseUrl` boolean's one-per-process semantics.
const MISSING_AUTH_TOKEN_WARN_KEY = 'missing-auth-token';

/**
 * Read the Vite DEV flag defensively. `import.meta.env` is Vite-provided; under
 * the `node --import tsx --test` runner there is no Vite transform, so the cast
 * + optional chaining keeps this safe (and `false`) in tests, gating the
 * missing-token warning out of the test runner entirely.
 */
function isDevEnvironment(): boolean {
  return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
}

/**
 * The SOLE fail-silent path when `readAuthToken()` is `null`. Emits a one-shot
 * DEV warning (keyed in the caller's `warnOnceKeys` set) and returns the prior
 * cache/sentinel value unchanged — NO request is fired. Identical in shape to
 * the fetchers' missing-`VITE_API_BASE_URL` branch so a null token never throws
 * to a widget and never blanks an already-populated surface.
 *
 * @param cacheRef The fetcher's cached `Ref` (or a fresh sentinel `Ref` on a
 *                 cache miss); its `.value` is returned unchanged.
 * @param warnOnceKeys The fetcher's module-level warn-once `Set`.
 * @returns The prior cache/sentinel `ServiceResponse`.
 */
export function handleMissingAuthToken<T>(
  cacheRef: Ref<ServiceResponse<T>>,
  warnOnceKeys: Set<string>,
): ServiceResponse<T> {
  if (!warnOnceKeys.has(MISSING_AUTH_TOKEN_WARN_KEY)) {
    warnOnceKeys.add(MISSING_AUTH_TOKEN_WARN_KEY);
    if (isDevEnvironment()) {
      console.warn(MISSING_AUTH_TOKEN_WARNING);
    }
  }
  return cacheRef.value;
}

// why: test-only escape hatch. Production code NEVER invokes `__testHooks`;
// `App.vue` uses `registerAuthTokenReader`. Tests inject a deterministic token
// source (or `null` to model the unregistered / signed-out state).
export const __testHooks = {
  /**
   * Swap the registered token reader for test determinism. Passing `null`
   * unregisters the reader so `readAuthToken()` returns `null` (the
   * pre-registration / signed-out state). Production code never invokes this.
   */
  setAuthToken(reader: (() => string | null) | null): void {
    authTokenReader = reader;
  },
};
