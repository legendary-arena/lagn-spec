/**
 * Owner Profile Types — Server Layer (WP-104)
 *
 * Durable contracts for the owner-edit half of the profile surface.
 * These types form the wire shape consumed by
 * `apps/arena-client/src/pages/MyProfilePage.vue` (via
 * `ownerProfileApi.ts`) and by the three new owner-only HTTP
 * endpoints under `/api/me/`. Field shapes, names, and order are
 * locked under D-10403 (per-section closed-set privacy enum) /
 * D-10404 (provider closed-set allowlist) / D-10405 (HTTPS-only URL
 * validation) at WP-104 execution.
 *
 * This module belongs to the server layer only. It must not be
 * imported from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `packages/vue-sfc-loader/**`,
 * `apps/arena-client/**`, `apps/replay-producer/**`, or
 * `apps/registry-viewer/**`. The arena-client consumes the same
 * fields via a structurally compatible inline interface in
 * `apps/arena-client/src/lib/api/ownerProfileApi.ts` (engine /
 * server isolation rule mirroring WP-102's `profileApi.ts`
 * precedent).
 *
 * `AccountId`, `PlayerAccount`, `DatabaseClient` are re-imported
 * from `../identity/identity.types.js` per the WP-052 D-5201
 * contract — never redeclared.
 * `RequireAuthenticatedSessionOptions`, `SessionTokenRequest`,
 * `SessionVerifier`, `AccountResolver` are re-imported from
 * `../auth/sessionToken.types.js` for the route handler signatures.
 *
 * `OwnerProfileResult<T>` is declared locally — `Result<T>` from
 * `../identity/identity.types.js` is keyed on `IdentityErrorCode`
 * which cannot carry the WP-104 codes; this mirrors the WP-102
 * `ProfileResult<T>` PS-5 precedent verbatim.
 *
 * Authority: WP-104 §Scope (In) §B; EC-128 §1; D-10401 (module
 * path); D-10403 (per-section closed-set privacy enum); D-10404
 * (provider closed-set allowlist); D-10405 (HTTPS-only URL
 * validation); WP-102 §Locked contract values (PS-5
 * `ProfileResult<T>` declared-locally precedent).
 */

import type {
  AccountId,
  DatabaseClient,
  PlayerAccount,
} from '../identity/identity.types.js';
import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';
import type { TeamAffiliation } from '../teams/team.types.js';

// why: re-exported so other modules in this layer (and tests) can
// reference the identity-layer + auth-layer aliases through
// `./ownerProfile.types.js` without re-importing from those modules
// directly, preserving the single import boundary documented above.
// Mirrors the WP-102 `profile.types.ts` re-export precedent.
export type {
  AccountId,
  AccountResolver,
  DatabaseClient,
  PlayerAccount,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
};

/**
 * One owner-curated profile link. Composed by `getOwnerProfile` and
 * `replaceOwnerLinks` from a row of `legendary.player_links`. The
 * server is authoritative on order — the `links` array on
 * `OwnerProfileView` is ALWAYS sorted ascending by `displayOrder`
 * (ties broken by `link_id` ascending, which should not occur given
 * the UNIQUE `(player_id, display_order)` constraint but is locked
 * defensively in the SQL `ORDER BY display_order ASC, link_id ASC`
 * clause).
 *
 * The wire shape excludes `linkId` and `playerId` — both are
 * server-internal. Adding either to the wire shape requires a new
 * decision because exposing `linkId` would let a client track
 * server-assigned identifiers across edit sessions, breaking the
 * D-10407 replace-all-by-list semantics.
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
 * Owner's editable view of their own profile. Composed by
 * `getOwnerProfile` from `legendary.player_profiles` (1:1 with
 * `legendary.players`) plus `legendary.player_links` (many-to-1).
 * Returned verbatim as the JSON body of `GET /api/me/profile`
 * (200 path) and of every successful `PATCH /api/me/profile` /
 * `PUT /api/me/links` response so clients re-render from server
 * authoritative state without client-side merge.
 *
 * `Object.keys(view).sort()` MUST equal exactly:
 *   `['aboutMe','aboutMeVisibility','avatarUrl','avatarVisibility',
 *     'links','linksVisibility','teamAffiliations','updatedAt']`
 * — drift-detection test in `ownerProfile.logic.test.ts` enforces
 * this. WP-109 / D-10904 (PS-3 = YES user pre-lock 2026-05-03)
 * extended the locked field set from 7 to 8 keys with the
 * read-only `teamAffiliations[]` listing — composed by the same
 * shared helper that powers the public profile per pre-flight
 * PS-3. `email`, `authProvider`, `authProviderId`, `createdAt`
 * from `legendary.players` are deliberately absent: they are
 * private fields of the account and have no business on the
 * owner-edit surface.
 *
 * `null` values on `avatarUrl` / `aboutMe` / `updatedAt` represent
 * the never-edited synthesized-default state per WP-104 §Scope
 * (In) §C "Read invariant" — when no `legendary.player_profiles`
 * row exists for the supplied account, `getOwnerProfile`
 * synthesizes a default view with all owner-editable fields at
 * their locked default values; no INSERT fires on the read path,
 * the first PATCH owns row creation via the locked
 * `INSERT ... ON CONFLICT (player_id) DO UPDATE` upsert pattern.
 *
 * The `links` array is ALWAYS sorted ascending by `displayOrder`
 * per the locked ordering invariant in WP-104 §Locked contract
 * values; clients MUST NOT defensively re-sort.
 */
export interface OwnerProfileView {
  readonly avatarUrl: string | null;
  readonly aboutMe: string | null;
  readonly avatarVisibility: 'private' | 'public';
  readonly aboutMeVisibility: 'private' | 'public';
  readonly linksVisibility: 'private' | 'public';
  readonly links: OwnerProfileLink[];
  readonly updatedAt: string | null;
  // why: WP-109 / D-10904 (PS-3 = YES user pre-lock 2026-05-03) —
  // read-only listing of the owner's team affiliations as the
  // owner sees them (viewer = subject, so 'private' teams are
  // visible). Composed by composeTeamAffiliationsForProfile (same
  // helper that powers the public profile); team mutations flow
  // through /api/teams/* and never through MyProfilePage.vue or
  // /api/me endpoints.
  readonly teamAffiliations: TeamAffiliation[];
}

/**
 * Programmatic error codes for fallible owner-profile operations.
 * Closed union: callers dispatch on `code` without parsing prose
 * `reason` strings.
 *
 * `'unknown_account'` is the rare-race code emitted when
 * `requireAuthenticatedSession` produced an `accountId` that has
 * no matching `legendary.players` row by the time
 * `loadPlayerIdByAccountId` ran — a row-deleted-mid-request edge
 * case the orchestrator cannot prevent on its own.
 *
 * Adding a code requires updating both this union and
 * `OWNER_PROFILE_ERROR_CODES` in the same change; the drift-
 * detection test in `ownerProfile.logic.test.ts` asserts forward
 * and backward inclusion.
 */
export type OwnerProfileErrorCode =
  | 'invalid_request'
  | 'invalid_avatar_url'
  | 'invalid_link_url'
  | 'too_many_links'
  | 'unknown_account';

/**
 * Canonical readonly array mirroring the `OwnerProfileErrorCode`
 * union. Adding a value requires updating both the union and this
 * array in the same change (see code-style §Drift Detection).
 */
export const OWNER_PROFILE_ERROR_CODES: readonly OwnerProfileErrorCode[] = [
  'invalid_request',
  'invalid_avatar_url',
  'invalid_link_url',
  'too_many_links',
  'unknown_account',
] as const;

// why: declared locally rather than re-imported from
// `../identity/identity.types.js`. WP-052's `Result<T>` is keyed
// on `IdentityErrorCode` (a four-value union covering account-
// creation failures: `'duplicate_email' | 'invalid_email' |
// 'invalid_display_name' | 'unknown_account'`) and cannot carry
// the WP-104 codes (`'invalid_request'` / `'invalid_avatar_url'`
// / `'invalid_link_url'` / `'too_many_links'`). The shape mirrors
// WP-052's `Result<T>` exactly — same `ok` discriminant, same
// `value` / `reason` / `code` fields — but with the owner-profile
// error union per the WP-102 PS-5 precedent. `AccountId`,
// `PlayerAccount`, and `DatabaseClient` are still re-imported
// above (no parallel declarations) so the identity contract
// remains the single source of truth for those three aliases.
/**
 * Discriminated-union result type for fallible owner-profile
 * operations. The `ok: true` branch carries the success value;
 * the `ok: false` branch carries a full-sentence `reason` string
 * (per code-style Rule 11) and a programmatic `code` for caller-
 * side dispatch without prose parsing.
 */
export type OwnerProfileResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; code: OwnerProfileErrorCode };

/**
 * Sparse partial PATCH body for `PATCH /api/me/profile` (per
 * D-10406 RFC 7396 semantics). Every field is optional; key
 * absence means "leave unchanged"; explicit `null` means "clear
 * the field"; a string value means "set the field to that
 * string". The literal four-character string `"null"` is
 * treated as the literal string, NOT as a clear-intent signal.
 * The validator in `upsertOwnerProfile` distinguishes the three
 * states via `Object.hasOwn` per the locked pattern; inline
 * ternaries returning `T | undefined` for optional values fail
 * `exactOptionalPropertyTypes` and are forbidden.
 */
export interface OwnerProfilePatch {
  readonly avatarUrl?: string | null;
  readonly aboutMe?: string | null;
  readonly avatarVisibility?: 'private' | 'public';
  readonly aboutMeVisibility?: 'private' | 'public';
  readonly linksVisibility?: 'private' | 'public';
}

/**
 * Full-replace body for `PUT /api/me/links` (per D-10407
 * replace-all-by-list semantics). The server transactionally
 * `DELETE`s all existing rows for the account and `INSERT`s the
 * new array; clients always send the full list. The maximum
 * number of links per account is 10 (locked under D-10407);
 * over-cap requests return `code: 'too_many_links'`.
 *
 * The `displayOrder` field on each entry is ignored on the
 * write path — the server uses the array index (0-based) as the
 * authoritative `display_order` value, preserving the order the
 * client sent. The wire shape carries `displayOrder` as a
 * `number` for symmetry with `OwnerProfileLink`, but the value
 * is server-authoritative on the read path.
 */
export type OwnerLinkInput = OwnerProfileLink;
