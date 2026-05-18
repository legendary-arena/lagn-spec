/**
 * Owner Profile API Client — Arena Client (WP-104)
 *
 * Typed `fetch` wrappers for the three owner-only HTTP endpoints
 * under `/api/me/`. Consumed by
 * `apps/arena-client/src/pages/MyProfilePage.vue`.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`, or
 * `@legendary-arena/vue-sfc-loader`. The `OwnerProfileView` /
 * `OwnerProfileLink` shapes are declared inline here by structural
 * compatibility with their server-side counterparts in
 * `apps/server/src/profile/ownerProfile.types.ts` — the engine /
 * server-isolation rule prohibits the client from importing
 * server-layer types directly. Mirrors the WP-102
 * `profileApi.ts` precedent verbatim.
 *
 * Authority: WP-104 §Scope (In) §G; EC-128 §1.
 * WP-161 update: fetch URLs now prefixed via `buildApiUrl(...)` so the
 * SPA can target the API host configured via `VITE_API_BASE_URL` at
 * build time. Wire shapes, function signatures, and error handling
 * are byte-identical to WP-104; only the URL string differs.
 */

import { buildApiUrl } from './apiBaseUrl';

/**
 * Owner-curated profile link wire shape. Mirrors
 * `apps/server/src/profile/ownerProfile.types.ts#OwnerProfileLink`
 * by structural compatibility — the server is authoritative on
 * the shape; this declaration is the type-level contract on the
 * client.
 */
export interface OwnerProfileLink {
  readonly provider:
    | 'twitter'
    | 'github'
    | 'twitch'
    | 'discord'
    | 'youtube'
    | 'website';
  readonly url: string;
  readonly isPublic: boolean;
  readonly displayOrder: number;
}

/**
 * Owner's editable view of their own profile. Mirrors
 * `apps/server/src/profile/ownerProfile.types.ts#OwnerProfileView`
 * by structural compatibility. Fields private to `legendary.players`
 * (`email`, `authProvider`, `authProviderId`, `createdAt`) are
 * intentionally absent.
 */
export interface OwnerProfileView {
  readonly avatarUrl: string | null;
  readonly aboutMe: string | null;
  readonly avatarVisibility: 'private' | 'public';
  readonly aboutMeVisibility: 'private' | 'public';
  readonly linksVisibility: 'private' | 'public';
  readonly links: OwnerProfileLink[];
  readonly updatedAt: string | null;
}

/**
 * Sparse partial PATCH body for `PATCH /api/me/profile`. Every
 * field is optional; key absence means "leave unchanged"; explicit
 * `null` means "clear the field"; a string value means "set the
 * field to that string". Mirrors the server `OwnerProfilePatch`.
 */
export interface OwnerProfilePatch {
  readonly avatarUrl?: string | null;
  readonly aboutMe?: string | null;
  readonly avatarVisibility?: 'private' | 'public';
  readonly aboutMeVisibility?: 'private' | 'public';
  readonly linksVisibility?: 'private' | 'public';
}

/**
 * Result discriminator for the owner-profile fetch wrappers. The
 * success branch carries the parsed view; the failure branch
 * carries only the HTTP status code plus a closed-set error code
 * (when the server emitted one in the response body).
 */
export type OwnerProfileApiResult =
  | { ok: true; value: OwnerProfileView }
  | { ok: false; status: number; code: string | null };

async function parseFailure(
  response: Response,
): Promise<{ ok: false; status: number; code: string | null }> {
  let code: string | null = null;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') {
      code = body.error;
    }
  } catch {
    // why: a malformed JSON response (or no body) is a transport-level
    // failure; we surface only the status code in that case so the
    // page can render a generic error banner without crashing the
    // promise chain.
    code = null;
  }
  return { ok: false, status: response.status, code };
}

/**
 * Fetch the authenticated owner's profile. Returns
 * `{ ok: true, value }` on HTTP 200; returns
 * `{ ok: false, status, code }` on every other status.
 */
export async function fetchOwnerProfile(
  authToken: string | null,
): Promise<OwnerProfileApiResult> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl('/api/me/profile'), {
      method: 'GET',
      headers:
        authToken === null ? {} : { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    return { ok: false, status: 0, code: null };
  }
  if (response.status !== 200) {
    return await parseFailure(response);
  }
  const value = (await response.json()) as OwnerProfileView;
  return { ok: true, value };
}

/**
 * Apply a sparse partial PATCH to the authenticated owner's
 * profile. Returns the updated view on success.
 */
export async function updateOwnerProfile(
  authToken: string | null,
  patch: OwnerProfilePatch,
): Promise<OwnerProfileApiResult> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl('/api/me/profile'), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken === null
          ? {}
          : { Authorization: `Bearer ${authToken}` }),
      },
      body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, status: 0, code: null };
  }
  if (response.status !== 200) {
    return await parseFailure(response);
  }
  const value = (await response.json()) as OwnerProfileView;
  return { ok: true, value };
}

/**
 * Replace the authenticated owner's full link list. Returns the
 * updated view on success.
 */
export async function replaceOwnerLinks(
  authToken: string | null,
  links: readonly OwnerProfileLink[],
): Promise<OwnerProfileApiResult> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl('/api/me/links'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken === null
          ? {}
          : { Authorization: `Bearer ${authToken}` }),
      },
      body: JSON.stringify({ links }),
    });
  } catch {
    return { ok: false, status: 0, code: null };
  }
  if (response.status !== 200) {
    return await parseFailure(response);
  }
  const value = (await response.json()) as OwnerProfileView;
  return { ok: true, value };
}
