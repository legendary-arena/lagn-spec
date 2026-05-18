/**
 * API Base URL helper — arena-client HTTP API target (WP-161).
 *
 * Resolves the build-time env var `VITE_API_BASE_URL` and prefixes
 * caller-supplied paths. Mirrors the `VITE_SERVER_URL` precedent
 * (consumed at `apps/arena-client/src/lobby/lobbyApi.ts:21`) for the
 * boardgame.io live-match transport — the HTTP API and the WS transport
 * are independently configurable, but the operational topology today
 * co-serves both on the same host.
 *
 * Production deployments (Cloudflare Pages) MUST set
 * `VITE_API_BASE_URL` in the project's build-time env so Vite inlines
 * the value at build time. The local-dev fallback is
 * `http://localhost:8000` — the same shape as the boardgame.io
 * server's default — so `pnpm dev` keeps working without `.env` setup
 * when the local server is running on the standard port.
 *
 * Authority: WP-161 §A (helper shape) + §B (env var hygiene);
 * D-16101 (env-var-based API base URL surfacing).
 */

// why: VITE_API_BASE_URL is inlined at build time by Vite. The fallback
// `http://localhost:8000` is a dev-only convenience matching the
// boardgame.io server's default port and `VITE_SERVER_URL`'s fallback
// precedent. Production builds (Cloudflare Pages) MUST set
// `VITE_API_BASE_URL` via the Pages project's build-time environment
// variables; the fallback must never reach production (if it does, the
// browser will try to connect to localhost:8000 and fail visibly —
// loud failure, easy to diagnose). The `?.` guard handles the
// node:test runner (no Vite transform) where `import.meta.env` may be
// undefined; mirrors `App.vue:171`'s `import.meta.env?.DEV` pattern.
export const apiBaseUrl: string =
  import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000';

/**
 * Prefix an absolute path with the configured API base URL. Caller is
 * responsible for the path-segment encoding of any dynamic segments
 * (e.g., `profileApi.ts` `encodeURIComponent(handle)`); this helper
 * does NOT validate, encode, or normalize.
 *
 * @param path A path beginning with `/api/` (e.g., `/api/me/profile`).
 * @returns The absolute URL the API client should fetch.
 */
export function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}
