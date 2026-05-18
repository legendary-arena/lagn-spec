/**
 * Public Profile API Client — Arena Client (WP-102)
 *
 * Typed `fetch` wrapper for `GET /api/players/:handle/profile`.
 * Consumed by `apps/arena-client/src/pages/PlayerProfilePage.vue`.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`, or
 * `@legendary-arena/vue-sfc-loader`. The `PublicProfileView` and
 * `PublicReplaySummary` shapes are declared inline here by
 * structural compatibility with their server-side counterparts in
 * `apps/server/src/profile/profile.types.ts` — the engine /
 * server-isolation rule per WP-102 §Scope (In) §G prohibits the
 * client from importing server-layer types directly.
 *
 * Authority: WP-102 §Scope (In) §G; EC-117 §Files to Produce.
 * WP-161 update: fetch URL now prefixed via `buildApiUrl(...)` so the
 * SPA can target the API host configured via `VITE_API_BASE_URL` at
 * build time. Wire shape, function signature, and error handling are
 * byte-identical to WP-102; only the URL string differs.
 */

import { buildApiUrl } from './apiBaseUrl';

/**
 * Public-facing replay summary shape returned by
 * `GET /api/players/:handle/profile`. Mirrors
 * `apps/server/src/profile/profile.types.ts#PublicReplaySummary`
 * by structural compatibility — the server is authoritative on the
 * shape; this declaration is the type-level contract on the client.
 */
export interface PublicReplaySummary {
  readonly replayHash: string;
  readonly scenarioKey: string;
  readonly visibility: 'public' | 'link';
  readonly createdAt: string;
}

/**
 * Public-facing profile view shape returned by
 * `GET /api/players/:handle/profile`. Mirrors
 * `apps/server/src/profile/profile.types.ts#PublicProfileView`
 * by structural compatibility. `accountId`, `email`, `authProvider`,
 * `authProviderId`, `createdAt`, and `updatedAt` from the server
 * `PlayerAccount` are intentionally absent — the public surface
 * carries handle-as-presentation-alias only.
 */
export interface PublicProfileView {
  readonly handleCanonical: string;
  readonly displayHandle: string;
  readonly displayName: string;
  readonly publicReplays: PublicReplaySummary[];
}

/**
 * Result discriminator for `fetchPublicProfile`. The success branch
 * carries the parsed view; the failure branch carries only the HTTP
 * status code — no body detail propagated, so a malformed or
 * information-leaking server response cannot reach the page.
 */
export type FetchPublicProfileResult =
  | { ok: true; value: PublicProfileView }
  | { ok: false; status: number };

// why: percent-encoding the handle defends against values that fail
// format validation but somehow reach the client (e.g., a stale
// bookmark with a `/` or `%` in the path segment, or a malicious
// query string that survived the App.vue parser). The server is
// authoritative regardless — `getPublicProfileByHandle`
// canonicalizes the handle before lookup and returns 404 for
// values that don't match `legendary.players.handle_canonical` —
// but encoding here keeps the URL well-formed so the request
// reaches the route handler instead of being rejected by an
// upstream proxy or by `URL` construction in `fetch`. RISK #15
// site #10 from copilot-check 2026-04-28.
/**
 * Fetch the public profile for a handle. Returns
 * `{ ok: true, value }` on HTTP 200 with a JSON body; returns
 * `{ ok: false, status }` on any non-200 status (404 unknown
 * handle, 500 infra failure, 0 network failure). Never throws —
 * `fetch` rejection is caught and surfaced as `status: 0`.
 */
export async function fetchPublicProfile(
  handle: string,
): Promise<FetchPublicProfileResult> {
  const url = buildApiUrl(`/api/players/${encodeURIComponent(handle)}/profile`);
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { ok: false, status: 0 };
  }
  if (response.status !== 200) {
    return { ok: false, status: response.status };
  }
  const value = (await response.json()) as PublicProfileView;
  return { ok: true, value };
}
