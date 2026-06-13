/**
 * Authentication broker SDK wrapper — broker-confinement seam (WP-241).
 *
 * This is the ONLY file in the dashboard app that may import from
 * `@teamhanko/*` at runtime. Every other file (the Pinia auth store, the
 * LoginPage, App.vue) consumes this wrapper so the authentication broker is
 * replaceable by changing one file — mirroring the server-side WP-099 / D-9904
 * module-path lock under the server app's `src/auth/hanko/`.
 *
 * why: this is a LOCAL COPY of the arena-client app's `src/auth/hankoClient.ts`,
 * NOT an import from it. The Layer Boundary forbids one `apps/*` package
 * importing another; the dashboard and the game client are sibling apps. This is
 * the second copy of the wrapper, so it is duplicated rather than extracted into
 * a shared client-auth package (00.6 Rule 1 — abstract only at the THIRD copy; a
 * shared package is premature here). The two copies are intentionally
 * structurally identical so a future extraction is mechanical.
 *
 * The wrapper accepts an optional `__hankoFactory` test seam so unit tests can
 * inject a fake broker without loading the real SDK (whose browser-only
 * side-effect modules would crash under the `node --import tsx --test` runner).
 * The production default factory uses dynamic import so the broker bundle is
 * only paid on a real sign-in attempt, never at test time.
 *
 * Authority: WP-241 §A (SDK wrapper contract); mirrors WP-126 / WP-160
 * (D-16001 widget choice; D-16003 token attachment via the Pinia store this
 * wrapper feeds; D-16005 session-check interval; D-16009 failure-mode
 * surfacing).
 */

/**
 * The minimal subset of the broker SDK's session object the wrapper actually
 * invokes. The full SDK class exposes many additional surfaces; pinning down
 * only the methods consumed here lets test fakes implement a tiny object
 * instead of stubbing the entire API. Production callers never construct a
 * `HankoLike` directly — the production factory's promise resolves to the real
 * SDK instance, which structurally satisfies this shape.
 */
export interface HankoLike {
  getSessionToken(): string;
  logout(): Promise<void>;
  onSessionCreated(callback: (detail: unknown) => void): () => void;
  onSessionExpired(callback: (detail: unknown) => void): () => void;
  onUserLoggedOut(callback: (detail: unknown) => void): () => void;
}

/**
 * Configuration for `initializeHankoClient`. The tenant URL is required; the
 * session-check interval is optional (the broker supplies a default — see
 * D-16005). `__hankoFactory` is the test-only injection seam; production
 * callers omit it.
 */
export interface HankoClientInitOptions {
  readonly tenantBaseUrl: string;
  readonly sessionCheckIntervalMs?: number;
  readonly __hankoFactory?: (
    tenantBaseUrl: string,
    options: { readonly sessionCheckInterval?: number },
  ) => Promise<HankoLike>;
}

/**
 * Opaque handle returned from a successful `initializeHankoClient` call. The
 * wrapped SDK instance is intentionally exposed only through this handle;
 * consumers invoke the exported functions, which accept the handle as their
 * first parameter.
 */
export interface HankoClientHandle {
  readonly hanko: HankoLike;
}

/**
 * Closed-set callback shape registered with `subscribeToSessionEvents`. Adding
 * a new broker event (e.g. `onUserDeleted`) is OUT OF SCOPE; extend this shape
 * via a closed-set drift test if a future consumer needs another event.
 */
export interface HankoSessionListeners {
  readonly onSessionCreated: (token: string) => void;
  readonly onSessionExpired: () => void;
  readonly onUserLoggedOut: () => void;
}

/**
 * Typed error raised when `initializeHankoClient` cannot reach the
 * authentication broker (network down, tenant URL invalid, broker bundle failed
 * to load). The underlying error is intentionally swallowed and not surfaced —
 * leaking the tenant URL or any payload would violate the §3 trust posture
 * (D-16009).
 */
export class HankoInitializationFailed extends Error {
  constructor(message = 'Sign-in is temporarily unavailable.') {
    super(message);
    this.name = 'HankoInitializationFailed';
  }
}

async function defaultProductionFactory(
  tenantBaseUrl: string,
  options: { readonly sessionCheckInterval?: number },
): Promise<HankoLike> {
  // why: dynamic import keeps the broker bundle out of the node:test runner. A
  // module-level import would force the test process to load the broker's
  // browser-only side-effect modules (custom-element registration, etc.), which
  // would crash without a DOM. Production callers pay the import once on the
  // first sign-in attempt; tests inject `__hankoFactory` and skip this entirely.
  const { register } = await import('@teamhanko/hanko-elements');
  const result = await register(tenantBaseUrl, options);
  // The real SDK instance structurally satisfies HankoLike — getSessionToken,
  // logout, and the three on*() listener methods are all part of the public
  // SDK surface.
  return result.hanko as unknown as HankoLike;
}

/**
 * Initialize the broker SDK against the configured tenant. Returns an opaque
 * handle on success; rejects with `HankoInitializationFailed` on any failure
 * (network, bundle load, tenant unreachable). The underlying error is
 * intentionally not surfaced to keep the failure banner generic per D-16009.
 *
 * @param options Tenant URL plus optional session-check interval plus optional
 *                `__hankoFactory` test seam.
 * @returns A handle wrapping the broker SDK instance.
 * @throws {HankoInitializationFailed} If the broker initialization fails for
 *                                     any reason.
 */
export async function initializeHankoClient(
  options: HankoClientInitOptions,
): Promise<HankoClientHandle> {
  const factory = options.__hankoFactory ?? defaultProductionFactory;
  const factoryOptions: { sessionCheckInterval?: number } = {};
  if (options.sessionCheckIntervalMs !== undefined) {
    factoryOptions.sessionCheckInterval = options.sessionCheckIntervalMs;
  }
  let hanko: HankoLike;
  try {
    hanko = await factory(options.tenantBaseUrl, factoryOptions);
  } catch {
    // why: the underlying error is intentionally swallowed. Surfacing it through
    // `console.warn` or in the thrown error message would leak the tenant URL or
    // transport-level details — a trust violation (D-16009). The static "Sign-in
    // is temporarily unavailable" banner is the only operator-visible failure.
    throw new HankoInitializationFailed();
  }
  return { hanko };
}

/**
 * Read the current session token from the broker SDK. Returns `null` when the
 * SDK reports no active session — including the case where the SDK returns an
 * empty string, which the wrapper normalizes so callers can use a single
 * `=== null` check.
 *
 * @param handle The handle returned by `initializeHankoClient`.
 * @returns The bearer token, or `null` if no active session.
 */
export function getCurrentTokenFromHandle(handle: HankoClientHandle): string | null {
  const raw = handle.hanko.getSessionToken();
  if (raw === '' || raw === null || raw === undefined) {
    return null;
  }
  return raw;
}

/**
 * Sign the current user out of the broker session. Resolves when the broker has
 * invalidated the cookie; rejects if the broker call itself rejects. Callers
 * decide whether to surface the rejection or proceed fail-safely with local
 * cleanup.
 *
 * @param handle The handle returned by `initializeHankoClient`.
 */
export async function signOutCurrentSession(handle: HankoClientHandle): Promise<void> {
  // why: in `@teamhanko/hanko-elements` ^2.4.0 the public sign-out method is
  // `hanko.logout()` directly (the `user` property is `private readonly`).
  // Mirrors the arena-client wrapper's execution-time API correction (WP-160).
  await handle.hanko.logout();
}

/**
 * Register the three broker-event callbacks against the SDK. Each listener
 * fires across all browser tabs sharing the broker cookie (per the SDK's
 * BroadcastChannel semantics).
 *
 * @param handle The handle returned by `initializeHankoClient`.
 * @param listeners Closed-set callback shape (see `HankoSessionListeners`).
 */
export function subscribeToSessionEvents(
  handle: HankoClientHandle,
  listeners: HankoSessionListeners,
): void {
  handle.hanko.onSessionCreated(() => {
    // why: re-read getSessionToken() at fire time rather than parsing the
    // broker's event payload. The SDK's `SessionDetail` carries
    // `{ claims, expirationSeconds }` and does NOT include the token directly;
    // `getSessionToken()` is the documented stable API and the event-payload
    // shape changes across SDK versions. The empty-string normalization is
    // intentionally folded to the consumer (the listener takes a plain string).
    listeners.onSessionCreated(handle.hanko.getSessionToken() ?? '');
  });
  handle.hanko.onSessionExpired(() => {
    listeners.onSessionExpired();
  });
  handle.hanko.onUserLoggedOut(() => {
    listeners.onUserLoggedOut();
  });
}
