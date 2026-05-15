/**
 * Public Profile Types — Server Layer (WP-102)
 *
 * Durable contracts for the public, read-only player profile surface
 * introduced by WP-102. These types form the read-shape consumed by
 * `apps/arena-client/src/pages/PlayerProfilePage.vue` (via the
 * `fetchPublicProfile` HTTP wrapper) and by any future profile-feature
 * WP (WP-104 owner edit, WP-105 badges, WP-107+ integrity, WP-108+
 * support). Field shapes, names, and order are locked by WP-102.
 *
 * This module belongs to the server layer only. It must not be
 * imported from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `packages/vue-sfc-loader/**`,
 * `apps/arena-client/**`, `apps/replay-producer/**`, or
 * `apps/registry-viewer/**`. The arena-client consumes the same
 * fields via a structurally compatible inline interface in
 * `apps/arena-client/src/lib/api/profileApi.ts` (engine/server
 * isolation rule).
 *
 * Authority: WP-102 §Scope (In) §A; EC-117 §Locked Values; D-5201
 * (AccountId is server-internal); D-5203 (identity persistence
 * taxonomy); pre-flight 2026-04-28 PS-5 (`ProfileResult<T>` declared
 * locally, not re-imported from `Result<T>`).
 */

import type {
  AccountId,
  DatabaseClient,
  PlayerAccount,
} from '../identity/identity.types.js';
import type { TeamAffiliation } from '../teams/team.types.js';

// why: re-exported so other modules in this layer (and tests) can
// reference the identity-layer aliases through `./profile.types.js`
// without re-importing from `../identity/identity.types.js` directly,
// preserving the single import boundary documented above.
export type { AccountId, DatabaseClient, PlayerAccount };

// why: 6-field shape — extended by WP-109 (teamAffiliations) and
// WP-105 (badges) from the original WP-102 4-field set. Rename or
// further addition requires a `DECISIONS.md` entry. `accountId` is
// intentionally absent — handle is the public identifier on this
// surface and exposing the server-internal stable ID per WP-052
// D-5201 would leak a cross-service identifier the public surface
// has no use for. `email`, `authProvider`, `authProviderId`,
// `createdAt`, and `updatedAt` from `PlayerAccount` are also absent
// for the same reason — the drift test in `profile.logic.test.ts`
// asserts `Object.keys(view).sort()` equals exactly the five fields
// listed below.
/**
 * Public, read-only projection of a player's profile composed by
 * `getPublicProfileByHandle` from `legendary.players`,
 * `legendary.replay_ownership`, and (per WP-109)
 * `legendary.team_member_events` ⨝ `legendary.teams`. Returned
 * verbatim as the JSON body of `GET /api/players/:handle/profile`
 * (200 path).
 */
export interface PublicProfileView {
  readonly handleCanonical: string;
  readonly displayHandle: string;
  readonly displayName: string;
  readonly publicReplays: PublicReplaySummary[];
  readonly teamAffiliations: TeamAffiliation[];
  readonly badges: PlayerBadgeSummary[];
}

/**
 * Public-facing badge summary projected from `PlayerBadge` rows via
 * `BadgeDefinition` lookup. Excludes server-internal fields (badgeId,
 * tier, sourceKind, sourceRef, isRevoked). `awardedAt` is rendered as
 * a locale-aware date string (no time component) by the client.
 */
export interface PlayerBadgeSummary {
  readonly badgeKey: string;
  readonly label: string;
  readonly description: string;
  readonly awardedAt: string;
}

// why: `'private'` is intentionally absent from the visibility union.
// The server-side SQL filter `visibility IN ('public', 'link')` is
// the authoritative gate; the type-level exclusion expresses that
// guarantee at the type level so any future caller that destructures
// a `PublicReplaySummary.visibility` cannot widen the type by
// accident. The application-layer guard in `profile.logic.ts`
// (`if (row.visibility !== 'public' && row.visibility !== 'link')
// continue;`) is the third layer of defense per RISK #10 from
// copilot-check 2026-04-28.
// why: `expiresAt` is intentionally absent. The server filters
// expired entries before returning (`expires_at IS NULL OR
// expires_at > now()`), so clients never see expiration timestamps
// and cannot rely on them for caching or for inferring retention
// class. `ownershipId` is also absent — it is the server-internal
// `bigserial` PK on `legendary.replay_ownership` and exposing it
// would leak the FK shape per WP-052 §Locked Values.
/**
 * Public, read-only summary of a single replay attached to a public
 * profile. Composed from a non-expired, public-or-link-visible row
 * of `legendary.replay_ownership`. Exactly four fields; drift-tested.
 */
export interface PublicReplaySummary {
  readonly replayHash: string;
  readonly scenarioKey: string;
  readonly visibility: 'public' | 'link';
  readonly createdAt: string;
}

/**
 * Programmatic error code emitted by `getPublicProfileByHandle` on
 * the no-such-player path. Single-value union for now: every
 * "no such handle" outcome — unclaimed, deleted, reserved, race —
 * collapses to this single code so the public surface cannot leak
 * which case applied. Expanding this union requires a new packet
 * and a `DECISIONS.md` entry.
 */
export type ProfileErrorCode = 'player_not_found';

/**
 * Canonical readonly array mirroring the `ProfileErrorCode` union.
 * Adding a value requires updating both the union and this array
 * in the same change (see code-style §Drift Detection). The
 * drift-detection test in `profile.logic.test.ts` asserts forward
 * and backward inclusion.
 */
export const PROFILE_ERROR_CODES: readonly ProfileErrorCode[] = [
  'player_not_found',
] as const;

// why: declared locally rather than re-imported from
// `../identity/identity.types.js`. WP-052's `Result<T>` is keyed on
// `IdentityErrorCode` (a four-value union covering account-creation
// failures: `'duplicate_email' | 'invalid_email' |
// 'invalid_display_name' | 'unknown_account'`) and cannot carry the
// profile-side `'player_not_found'` code. The shape mirrors WP-052's
// `Result<T>` exactly — same `ok` discriminant, same `value`,
// `reason`, `code` fields — but with the profile error union per
// pre-flight 2026-04-28 PS-5. `AccountId`, `PlayerAccount`, and
// `DatabaseClient` are still re-imported above (no parallel
// declarations) so the identity contract remains the single source
// of truth for those three aliases.
/**
 * Discriminated-union result type for fallible profile operations.
 * The `ok: true` branch carries the success value; the `ok: false`
 * branch carries a full-sentence `reason` string (per code-style
 * Rule 11) and a programmatic `code` for caller-side dispatch
 * without prose parsing.
 */
export type ProfileResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; code: ProfileErrorCode };
