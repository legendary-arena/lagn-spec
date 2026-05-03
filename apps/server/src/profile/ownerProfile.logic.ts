/**
 * Owner Profile Logic — Server Layer (WP-104)
 *
 * Public functions for the owner-edit half of the profile surface.
 * `getOwnerProfile` composes the read view (no row creation —
 * synthesizes a default view when no row exists per the
 * read-no-mutate invariant). `upsertOwnerProfile` applies a sparse
 * partial PATCH body via `INSERT ... ON CONFLICT DO UPDATE` so the
 * first PATCH creates the row. `replaceOwnerLinks` transactionally
 * replaces the full link list inside a single `BEGIN/COMMIT`
 * envelope. All four pure validators (`validateAvatarUrl`,
 * `validateLinkUrl`, `validateAboutMe`, `validateLinks`) return
 * typed `OwnerProfileResult` values; no exceptions thrown.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only
 * through the `DatabaseClient` alias.
 *
 * Read-no-mutate invariant: `getOwnerProfile` issues zero `INSERT`
 * / `UPDATE` / `DELETE` SQL anywhere. The first PATCH owns row
 * creation via the `INSERT ... ON CONFLICT (player_id) DO UPDATE`
 * upsert pattern in `upsertOwnerProfile`.
 *
 * Lifecycle prohibition: the four exported functions
 * (`getOwnerProfile`, `upsertOwnerProfile`, `replaceOwnerLinks`,
 * plus the route adapter in `ownerProfile.routes.ts`) MUST NOT be
 * called from `game.ts`, any `LegendaryGame.moves` entry, any
 * phase hook, any file under `packages/`, any file under
 * `apps/replay-producer/` or `apps/registry-viewer/`, or any file
 * under `apps/server/src/{identity,replay,competition,par,rules,
 * game}/`. They are consumed only by `ownerProfile.logic.test.ts`,
 * by `ownerProfile.routes.ts`, by `apps/server/src/server.mjs`
 * (one-line registration call per D-10408), and by
 * `apps/arena-client/src/pages/MyProfilePage.vue` via
 * `ownerProfileApi.ts`.
 *
 * Authority: WP-104 §Scope (In) §C; EC-128 §2 + §3; D-10403..
 * D-10407 (privacy / provider / URL / PATCH / PUT semantics);
 * WP-102 §Locked contract values (`loadPlayerIdByAccountId`
 * pattern); WP-052 D-5201 (Result-typed identity contract).
 */

import type {
  AccountId,
  DatabaseClient,
  OwnerLinkInput,
  OwnerProfileLink,
  OwnerProfilePatch,
  OwnerProfileResult,
  OwnerProfileView,
} from './ownerProfile.types.js';
import { composeTeamAffiliationsForProfile } from '../teams/team.logic.js';

/**
 * Locked closed-set allowlist for `legendary.player_links.provider`
 * per D-10404. Mirrors the SQL `CHECK (provider IN (...))` clause
 * in migration 009 verbatim. Drift between this array and the SQL
 * constraint is a contract violation; both must be updated
 * together.
 */
const ALLOWED_LINK_PROVIDERS: readonly OwnerProfileLink['provider'][] = [
  'twitter',
  'github',
  'twitch',
  'discord',
  'youtube',
  'website',
] as const;

/**
 * Locked closed-set allowlist for the three privacy-toggle columns
 * on `legendary.player_profiles` per D-10403. Mirrors the SQL
 * `CHECK (... IN ('private', 'public'))` clauses in migration 009
 * verbatim.
 */
const ALLOWED_VISIBILITY_VALUES: readonly OwnerProfileView['avatarVisibility'][] = [
  'private',
  'public',
] as const;

/**
 * Locked maximum number of links per account per D-10407. Over-cap
 * `replaceOwnerLinks` calls return `Result.fail({ code:
 * 'too_many_links' })` before any SQL fires.
 */
const MAX_LINKS_PER_ACCOUNT = 10;

/**
 * Locked maximum length for `about_me` text (matches the
 * `char_length(about_me) <= 500` SQL CHECK in migration 009).
 */
const MAX_ABOUT_ME_LENGTH = 500;

/**
 * Locked maximum length for `url` text (matches the
 * `char_length(url) <= 2048` SQL CHECK in migration 009).
 */
const MAX_LINK_URL_LENGTH = 2048;

/**
 * Resolve the bigint `player_id` for an `AccountId`. Mirrors the
 * WP-102 `loadPlayerIdByAccountId` precedent verbatim. Returns
 * `null` when no `legendary.players` row matches the supplied
 * `accountId` (race against deletion or a never-provisioned
 * orchestrator-emitted accountId). Pure read — no mutation.
 *
 * Declared as a private file-local helper rather than re-imported
 * from `profile.logic.ts` because that module is locked under
 * WP-102 contract and importing across siblings would couple
 * WP-104 to a WP-102 internal export. The two-line SQL is small
 * enough to duplicate; future de-duplication can extract to a
 * shared identity-layer helper without touching either WP's
 * locked contract files.
 */
async function loadPlayerIdByAccountId(
  accountId: AccountId,
  database: DatabaseClient,
): Promise<number | null> {
  const result = await database.query(
    'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
    [accountId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const rawId = result.rows[0].player_id;
  return typeof rawId === 'string' ? Number(rawId) : rawId;
}

/**
 * Pure validator for an `avatar_url` candidate. Returns a typed
 * `OwnerProfileResult<string>` carrying either the validated URL
 * verbatim or a `Result.fail` with code `'invalid_avatar_url'`.
 * Rejects empty strings, non-HTTPS URLs, and strings that fail
 * the WHATWG `URL` parser.
 *
 * No network call (no HEAD / GET on the URL) — the validator is
 * synchronous and side-effect-free per the layer-boundary
 * read-only-against-runtime-state discipline.
 */
export function validateAvatarUrl(
  candidate: string,
): OwnerProfileResult<string> {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return {
      ok: false,
      reason:
        'avatarUrl must be a non-empty HTTPS URL string; received empty or non-string value.',
      code: 'invalid_avatar_url',
    };
  }
  if (candidate.startsWith('https://') === false) {
    return {
      ok: false,
      reason:
        'avatarUrl must use the https:// scheme; HTTP and other schemes are rejected per D-10405 defense-in-depth.',
      code: 'invalid_avatar_url',
    };
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') {
      return {
        ok: false,
        reason:
          'avatarUrl must use the https:// scheme; the parsed URL protocol did not match.',
        code: 'invalid_avatar_url',
      };
    }
  } catch {
    return {
      ok: false,
      reason:
        'avatarUrl must be a parseable URL string; WHATWG URL parsing rejected the input.',
      code: 'invalid_avatar_url',
    };
  }
  return { ok: true, value: candidate };
}

/**
 * Pure validator for a single `player_links.url` candidate.
 * Returns a typed `OwnerProfileResult<string>` carrying either
 * the validated URL verbatim or a `Result.fail` with code
 * `'invalid_link_url'`. Same posture as `validateAvatarUrl`
 * (HTTPS-only, parseable) plus the 2048-character cap that
 * matches the SQL CHECK constraint in migration 009.
 */
export function validateLinkUrl(
  candidate: string,
): OwnerProfileResult<string> {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return {
      ok: false,
      reason:
        'links[].url must be a non-empty HTTPS URL string; received empty or non-string value.',
      code: 'invalid_link_url',
    };
  }
  if (candidate.length > MAX_LINK_URL_LENGTH) {
    return {
      ok: false,
      reason: `links[].url must be ${MAX_LINK_URL_LENGTH} characters or fewer; received longer value.`,
      code: 'invalid_link_url',
    };
  }
  if (candidate.startsWith('https://') === false) {
    return {
      ok: false,
      reason:
        'links[].url must use the https:// scheme; HTTP and other schemes are rejected per D-10405 defense-in-depth.',
      code: 'invalid_link_url',
    };
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') {
      return {
        ok: false,
        reason:
          'links[].url must use the https:// scheme; the parsed URL protocol did not match.',
        code: 'invalid_link_url',
      };
    }
  } catch {
    return {
      ok: false,
      reason:
        'links[].url must be a parseable URL string; WHATWG URL parsing rejected the input.',
      code: 'invalid_link_url',
    };
  }
  return { ok: true, value: candidate };
}

/**
 * Pure validator for an `about_me` candidate. Returns the validated
 * string verbatim or a `Result.fail` with code `'invalid_request'`
 * for non-string inputs / over-cap inputs. Empty strings are
 * accepted (the application treats empty about-me distinctly from
 * `null`-cleared about-me; only the latter sets the column to
 * `NULL` per the D-10406 PATCH null-clears norm).
 */
export function validateAboutMe(
  candidate: string,
): OwnerProfileResult<string> {
  if (typeof candidate !== 'string') {
    return {
      ok: false,
      reason: 'aboutMe must be a string or null; received non-string value.',
      code: 'invalid_request',
    };
  }
  if (candidate.length > MAX_ABOUT_ME_LENGTH) {
    return {
      ok: false,
      reason: `aboutMe must be ${MAX_ABOUT_ME_LENGTH} characters or fewer; received longer value.`,
      code: 'invalid_request',
    };
  }
  return { ok: true, value: candidate };
}

/**
 * Pure validator for the full `replaceOwnerLinks` array. Validates
 * the cap, every entry's provider against the closed-set
 * allowlist, every entry's `url` via `validateLinkUrl`, and every
 * entry's `isPublic` boolean. Returns the validated array on
 * success or a typed `Result.fail` on first failure (fail-fast —
 * there is no partial-update path).
 */
export function validateLinks(
  links: readonly OwnerLinkInput[],
): OwnerProfileResult<readonly OwnerLinkInput[]> {
  if (Array.isArray(links) === false) {
    return {
      ok: false,
      reason: 'links must be an array of link objects; received non-array value.',
      code: 'invalid_request',
    };
  }
  if (links.length > MAX_LINKS_PER_ACCOUNT) {
    return {
      ok: false,
      reason: `links array exceeds the locked maximum of ${MAX_LINKS_PER_ACCOUNT} entries per account.`,
      code: 'too_many_links',
    };
  }
  for (let i = 0; i < links.length; i += 1) {
    const entry = links[i];
    if (entry === null || typeof entry !== 'object') {
      return {
        ok: false,
        reason: `links[${i}] must be an object with provider / url / isPublic fields; received non-object value.`,
        code: 'invalid_request',
      };
    }
    const providerCandidate = (entry as { provider: unknown }).provider;
    if (
      typeof providerCandidate !== 'string' ||
      ALLOWED_LINK_PROVIDERS.includes(
        providerCandidate as OwnerProfileLink['provider'],
      ) === false
    ) {
      return {
        ok: false,
        reason: `links[${i}].provider must be one of ${ALLOWED_LINK_PROVIDERS.join(
          ', ',
        )}; received an invalid value.`,
        code: 'invalid_request',
      };
    }
    const urlCandidate = (entry as { url: unknown }).url;
    if (typeof urlCandidate !== 'string') {
      return {
        ok: false,
        reason: `links[${i}].url must be a string; received non-string value.`,
        code: 'invalid_link_url',
      };
    }
    const urlValidation = validateLinkUrl(urlCandidate);
    if (urlValidation.ok === false) {
      return urlValidation;
    }
    const isPublicCandidate = (entry as { isPublic: unknown }).isPublic;
    if (typeof isPublicCandidate !== 'boolean') {
      return {
        ok: false,
        reason: `links[${i}].isPublic must be a boolean; received non-boolean value.`,
        code: 'invalid_request',
      };
    }
  }
  return { ok: true, value: links };
}

interface PlayerProfileRow {
  avatar_url: string | null;
  about_me: string | null;
  avatar_visibility: string;
  about_me_visibility: string;
  links_visibility: string;
  updated_at: Date | string;
}

interface PlayerLinkRow {
  provider: string;
  url: string;
  is_public: boolean;
  display_order: number;
}

/**
 * Map a `legendary.player_links` row to the locked
 * `OwnerProfileLink` wire shape. Coerces `display_order` from
 * `pg`'s `string | number` PostgreSQL `int` representation to a
 * plain number, and narrows `provider` against the closed-set
 * allowlist defensively (the SQL CHECK constraint in migration
 * 009 enforces the same allowlist; this is defense-in-depth).
 */
function mapPlayerLinkRow(row: PlayerLinkRow): OwnerProfileLink {
  // why: the `provider` value comes from a CHECK-constrained column
  // so it is safe to narrow via the allowlist; the cast is a runtime
  // assertion the SQL constraint already proved at row-write time.
  return {
    provider: row.provider as OwnerProfileLink['provider'],
    url: row.url,
    isPublic: row.is_public,
    displayOrder:
      typeof row.display_order === 'string'
        ? Number(row.display_order)
        : row.display_order,
  };
}

/**
 * Synthesize the never-edited default `OwnerProfileView` for an
 * account that has no `legendary.player_profiles` row yet. Per
 * the WP-104 §Scope (In) §C "Read invariant" lock, the GET path
 * issues zero writes; the first PATCH owns row creation.
 *
 * `updatedAt` is `null` in this state to make the no-edit-yet
 * condition explicit on the wire.
 */
function synthesizeDefaultOwnerProfileView(): OwnerProfileView {
  // why: the synthesized view is the most-private fail-closed
  // default per D-10403 + Vision §3. A never-edited account leaks
  // nothing to any future surface-integration WP that joins these
  // toggles onto WP-102's PublicProfileView. `null` on `avatarUrl`
  // / `aboutMe` / `updatedAt` represents "no edit yet"; clients
  // render an empty-state edit form. The first successful PATCH
  // creates the row via the upsert pattern in upsertOwnerProfile,
  // which also bumps `updated_at` to `now()`.
  return {
    avatarUrl: null,
    aboutMe: null,
    avatarVisibility: 'private',
    aboutMeVisibility: 'private',
    linksVisibility: 'private',
    links: [],
    updatedAt: null,
  };
}

/**
 * Compose `OwnerProfileView` from a `legendary.player_profiles`
 * row and an array of `legendary.player_links` rows. Pure helper
 * — no DB access. Used by `getOwnerProfile`, `upsertOwnerProfile`,
 * and `replaceOwnerLinks` so all three exports return identically
 * shaped responses.
 */
function composeOwnerProfileView(
  profileRow: PlayerProfileRow,
  linkRows: readonly PlayerLinkRow[],
): OwnerProfileView {
  const links: OwnerProfileLink[] = [];
  for (const row of linkRows) {
    links.push(mapPlayerLinkRow(row));
  }
  const updatedAtIso =
    profileRow.updated_at instanceof Date
      ? profileRow.updated_at.toISOString()
      : profileRow.updated_at;
  return {
    avatarUrl: profileRow.avatar_url,
    aboutMe: profileRow.about_me,
    avatarVisibility:
      profileRow.avatar_visibility as OwnerProfileView['avatarVisibility'],
    aboutMeVisibility:
      profileRow.about_me_visibility as OwnerProfileView['aboutMeVisibility'],
    linksVisibility:
      profileRow.links_visibility as OwnerProfileView['linksVisibility'],
    links,
    updatedAt: updatedAtIso,
  };
}

/**
 * Read the authenticated owner's own profile + links. Issues two
 * read-only SELECTs (one against `legendary.player_profiles`, one
 * against `legendary.player_links`) and composes a fresh
 * `OwnerProfileView` literal. Returns
 * `Result.fail({ code: 'unknown_account' })` only when the
 * supplied `accountId` has no matching `legendary.players` row
 * (rare race against deletion).
 *
 * Read invariant: zero writes. When no
 * `legendary.player_profiles` row exists, returns the synthesized
 * default view per the read-no-mutate invariant. The first PATCH
 * is the sole site that creates the row via the upsert pattern
 * in `upsertOwnerProfile`.
 */
export async function getOwnerProfile(
  accountId: AccountId,
  database: DatabaseClient,
): Promise<OwnerProfileResult<OwnerProfileView>> {
  const playerId = await loadPlayerIdByAccountId(accountId, database);
  if (playerId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this query.',
      code: 'unknown_account',
    };
  }

  const profileResult = await database.query(
    'SELECT avatar_url, about_me, avatar_visibility, about_me_visibility, links_visibility, updated_at ' +
      'FROM legendary.player_profiles ' +
      'WHERE player_id = $1 LIMIT 1',
    [playerId],
  );

  const linkResult = await database.query(
    'SELECT provider, url, is_public, display_order ' +
      'FROM legendary.player_links ' +
      'WHERE player_id = $1 ' +
      'ORDER BY display_order ASC, link_id ASC',
    [playerId],
  );

  // why: WP-109 / D-10904 (PS-3 = YES) — compose teamAffiliations[]
  // via the shared helper. Viewer is the owner themselves (subject
  // = viewer = the same player_id), so 'private'-visibility teams
  // are visible. Friend-graph service is undefined per WP-109 §11
  // until a future WP introduces it; 'friends'-visibility teams
  // collapse to 'private' semantics server-side (still visible to
  // current/historical members, including the owner here).
  const teamAffiliations = await composeTeamAffiliationsForProfile(
    database,
    String(playerId),
    String(playerId),
    undefined,
  );

  if (profileResult.rows.length === 0) {
    // why: read-no-mutate invariant per WP-104 §Scope (In) §C —
    // synthesize the most-private default view when no profile row
    // exists. No INSERT fires on the read path; the first PATCH
    // creates the row via INSERT ... ON CONFLICT DO UPDATE in
    // upsertOwnerProfile. A never-edited account may still have
    // (degenerate but legal) link rows under the same player_id —
    // a dangling state that should not exist in practice but the
    // read path tolerates by overlaying the synthesized profile
    // defaults onto whatever links are present. teamAffiliations
    // is composed identically regardless of whether the
    // legendary.player_profiles row exists, so the synthesized-
    // default branch returns the same shape as the normal branch.
    const view = synthesizeDefaultOwnerProfileView();
    const links: OwnerProfileLink[] = [];
    for (const row of linkResult.rows as PlayerLinkRow[]) {
      links.push(mapPlayerLinkRow(row));
    }
    return {
      ok: true,
      value: {
        ...view,
        links,
        teamAffiliations: [...teamAffiliations],
      },
    };
  }

  const profileRow = profileResult.rows[0] as PlayerProfileRow;
  const view = composeOwnerProfileView(
    profileRow,
    linkResult.rows as PlayerLinkRow[],
  );
  return {
    ok: true,
    value: { ...view, teamAffiliations: [...teamAffiliations] },
  };
}

/**
 * Apply a sparse partial PATCH body to the owner's
 * `legendary.player_profiles` row per D-10406 RFC 7396 semantics.
 * Validates the entire body before any SQL fires; on validation
 * failure returns the appropriate typed `Result.fail`. Uses the
 * locked `INSERT ... ON CONFLICT (player_id) DO UPDATE` upsert
 * pattern so the first PATCH on a never-edited account creates
 * the row (read path remains read-no-mutate per the invariant
 * above).
 *
 * Three-state input discrimination via `Object.hasOwn` per the
 * WP-104 locked pattern: key absent → leave unchanged; key
 * present + value `null` → clear the field (set column to
 * `NULL`); key present + string value → set the field to that
 * string. The literal four-character string `"null"` is treated
 * as the literal string, NOT as a clear-intent signal.
 */
export async function upsertOwnerProfile(
  accountId: AccountId,
  patch: OwnerProfilePatch,
  database: DatabaseClient,
): Promise<OwnerProfileResult<OwnerProfileView>> {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return {
      ok: false,
      reason:
        'PATCH body must be a JSON object with sparse partial fields; received null, array, or non-object value.',
      code: 'invalid_request',
    };
  }

  // why: Object.hasOwn distinguishes "key absent" (leave unchanged) from
  // "key present, value null" (clear the field). typeof check distinguishes
  // "value is the literal four-character string 'null'" (set the field to
  // that string) from "value is the JSON null sentinel" (clear). The
  // conditional-assignment pattern (build a typed validatedFields map
  // first, then build SQL clauses from it) is the locked pattern; inline
  // ternaries returning T | undefined for optional values fail
  // exactOptionalPropertyTypes and are forbidden. Validation runs BEFORE
  // any DB call so a malformed PATCH body fails fast with a typed
  // Result.fail rather than burning a database round-trip on a known-bad
  // input.
  type ValidatedFieldValue =
    | { kind: 'null' }
    | { kind: 'value'; value: string };
  const validatedFields = new Map<string, ValidatedFieldValue>();

  if (Object.hasOwn(patch, 'avatarUrl')) {
    if (patch.avatarUrl === null) {
      validatedFields.set('avatar_url', { kind: 'null' });
    } else if (typeof patch.avatarUrl === 'string') {
      const validation = validateAvatarUrl(patch.avatarUrl);
      if (validation.ok === false) {
        return validation;
      }
      validatedFields.set('avatar_url', { kind: 'value', value: patch.avatarUrl });
    } else {
      return {
        ok: false,
        reason: 'avatarUrl must be a string or null; received non-string non-null value.',
        code: 'invalid_request',
      };
    }
  }

  if (Object.hasOwn(patch, 'aboutMe')) {
    if (patch.aboutMe === null) {
      validatedFields.set('about_me', { kind: 'null' });
    } else if (typeof patch.aboutMe === 'string') {
      const validation = validateAboutMe(patch.aboutMe);
      if (validation.ok === false) {
        return validation;
      }
      validatedFields.set('about_me', { kind: 'value', value: patch.aboutMe });
    } else {
      return {
        ok: false,
        reason: 'aboutMe must be a string or null; received non-string non-null value.',
        code: 'invalid_request',
      };
    }
  }

  if (Object.hasOwn(patch, 'avatarVisibility')) {
    const candidate = patch.avatarVisibility;
    if (
      typeof candidate !== 'string' ||
      ALLOWED_VISIBILITY_VALUES.includes(
        candidate as OwnerProfileView['avatarVisibility'],
      ) === false
    ) {
      return {
        ok: false,
        reason: `avatarVisibility must be one of ${ALLOWED_VISIBILITY_VALUES.join(
          ', ',
        )}; received an invalid value.`,
        code: 'invalid_request',
      };
    }
    validatedFields.set('avatar_visibility', { kind: 'value', value: candidate });
  }

  if (Object.hasOwn(patch, 'aboutMeVisibility')) {
    const candidate = patch.aboutMeVisibility;
    if (
      typeof candidate !== 'string' ||
      ALLOWED_VISIBILITY_VALUES.includes(
        candidate as OwnerProfileView['aboutMeVisibility'],
      ) === false
    ) {
      return {
        ok: false,
        reason: `aboutMeVisibility must be one of ${ALLOWED_VISIBILITY_VALUES.join(
          ', ',
        )}; received an invalid value.`,
        code: 'invalid_request',
      };
    }
    validatedFields.set('about_me_visibility', { kind: 'value', value: candidate });
  }

  if (Object.hasOwn(patch, 'linksVisibility')) {
    const candidate = patch.linksVisibility;
    if (
      typeof candidate !== 'string' ||
      ALLOWED_VISIBILITY_VALUES.includes(
        candidate as OwnerProfileView['linksVisibility'],
      ) === false
    ) {
      return {
        ok: false,
        reason: `linksVisibility must be one of ${ALLOWED_VISIBILITY_VALUES.join(
          ', ',
        )}; received an invalid value.`,
        code: 'invalid_request',
      };
    }
    validatedFields.set('links_visibility', { kind: 'value', value: candidate });
  }

  // why: validation has already passed every field; only now do we burn a
  // DB round-trip to look up the player_id. A bogus accountId surfaces as
  // 'unknown_account'; the race between session validation and this PATCH
  // is rare but the WP-104 §Non-Negotiable Constraints table requires
  // closed-set dispatch on it.
  const playerId = await loadPlayerIdByAccountId(accountId, database);
  if (playerId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this PATCH.',
      code: 'unknown_account',
    };
  }

  const insertColumns: string[] = [];
  const insertPlaceholders: string[] = [];
  const setClauseParts: string[] = [];
  const params: unknown[] = [playerId];
  let paramIndex = 2;

  for (const [columnName, fieldValue] of validatedFields) {
    if (fieldValue.kind === 'null') {
      insertColumns.push(columnName);
      insertPlaceholders.push('NULL');
      setClauseParts.push(`${columnName} = NULL`);
    } else {
      insertColumns.push(columnName);
      insertPlaceholders.push(`$${paramIndex}`);
      setClauseParts.push(`${columnName} = $${paramIndex}`);
      params.push(fieldValue.value);
      paramIndex += 1;
    }
  }

  // why: updated_at always advances on a successful PATCH per the WP-104
  // "idempotent update bumps updated_at" lock — even when the body carries
  // no recognized fields (an empty-PATCH no-op still bumps the timestamp).
  setClauseParts.push('updated_at = now()');

  // why: INSERT ... ON CONFLICT (player_id) DO UPDATE so the first PATCH
  // on a never-edited account creates the row; subsequent PATCHes update
  // it. The read path (getOwnerProfile) returns synthesized defaults when
  // no row exists, preserving the read-no-mutate invariant. When the
  // PATCH body carries no recognized fields, the INSERT runs with
  // (player_id) only and the ON CONFLICT branch updates only updated_at,
  // making the no-op PATCH idempotent.
  const insertColumnList =
    insertColumns.length === 0 ? '' : `, ${insertColumns.join(', ')}`;
  const insertValueList =
    insertPlaceholders.length === 0 ? '' : `, ${insertPlaceholders.join(', ')}`;
  const sql =
    `INSERT INTO legendary.player_profiles (player_id${insertColumnList}) ` +
    `VALUES ($1${insertValueList}) ` +
    `ON CONFLICT (player_id) DO UPDATE SET ${setClauseParts.join(', ')} ` +
    'RETURNING avatar_url, about_me, avatar_visibility, about_me_visibility, links_visibility, updated_at';

  const profileResult = await database.query(sql, params);
  const profileRow = profileResult.rows[0] as PlayerProfileRow;

  const linkResult = await database.query(
    'SELECT provider, url, is_public, display_order ' +
      'FROM legendary.player_links ' +
      'WHERE player_id = $1 ' +
      'ORDER BY display_order ASC, link_id ASC',
    [playerId],
  );

  // why: WP-109 / D-10904 (PS-3 = YES) — upsertOwnerProfile
  // returns the full OwnerProfileView (8 keys) so clients re-render
  // without an extra GET. teamAffiliations are observational and
  // unaffected by the PATCH; composing them here keeps the wire
  // shape consistent across getOwnerProfile / upsertOwnerProfile /
  // replaceOwnerLinks return paths.
  const teamAffiliations = await composeTeamAffiliationsForProfile(
    database,
    String(playerId),
    String(playerId),
    undefined,
  );

  return {
    ok: true,
    value: {
      ...composeOwnerProfileView(profileRow, linkResult.rows as PlayerLinkRow[]),
      teamAffiliations: [...teamAffiliations],
    },
  };
}

/**
 * Replace the full `legendary.player_links` list for the owner per
 * D-10407 replace-all-by-list semantics. Validates the entire
 * array before any SQL fires; on validation failure returns the
 * appropriate typed `Result.fail`. Executes the DELETE + INSERT
 * sequence inside a single PostgreSQL transaction so partial
 * state is never visible to a concurrent reader.
 *
 * Returns the updated full `OwnerProfileView` (re-reads the
 * profile row + the freshly-written link rows) so clients re-
 * render from server authoritative state without client-side
 * merge.
 */
export async function replaceOwnerLinks(
  accountId: AccountId,
  links: readonly OwnerLinkInput[],
  database: DatabaseClient,
): Promise<OwnerProfileResult<OwnerProfileView>> {
  const validation = validateLinks(links);
  if (validation.ok === false) {
    return validation;
  }

  const playerId = await loadPlayerIdByAccountId(accountId, database);
  if (playerId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this PUT.',
      code: 'unknown_account',
    };
  }

  // why: BEGIN/COMMIT envelope so partial state is never visible to a
  // concurrent reader. The DELETE + INSERT sequence is atomic with
  // respect to any concurrent SELECT — readers see either the
  // pre-replacement set or the post-replacement set, never a mixed
  // intermediate. display_order is the loop index (0-based),
  // preserving the order the client sent. The cap check
  // (over-MAX_LINKS_PER_ACCOUNT) ran in validateLinks above before
  // the transaction began.
  // why: any caught SQL error is captured in a local variable; we
  // explicitly issue ROLLBACK before releasing the pooled client
  // (pg-pool does NOT auto-rollback on release, so the next user of
  // the connection would otherwise inherit the open transaction).
  // After release we surface the captured error via Promise.reject
  // so the route layer's outer try/catch translates it to a 500
  // with `{ error: 'internal_error' }`. Plain `throw` is not used
  // here because EC-128 §2's no-throw gate applies to this file —
  // the OwnerProfileErrorCode closed set has no generic infra-
  // failure code to represent a transaction failure, so we
  // propagate via Promise.reject instead of a misleading
  // typed Result.fail.
  const client = await database.connect();
  let transactionError: unknown = null;
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM legendary.player_links WHERE player_id = $1',
      [playerId],
    );
    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      await client.query(
        'INSERT INTO legendary.player_links (player_id, provider, url, is_public, display_order) ' +
          'VALUES ($1, $2, $3, $4, $5)',
        [playerId, link.provider, link.url, link.isPublic, i],
      );
    }
    await client.query('COMMIT');
  } catch (caughtError) {
    transactionError = caughtError;
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      void rollbackError;
    }
  }
  client.release();
  if (transactionError !== null) {
    return Promise.reject(transactionError);
  }

  // why: re-read the profile row after the link replacement so the
  // returned OwnerProfileView reflects server authoritative state.
  // upsert is NOT triggered here — replaceOwnerLinks is a links-only
  // surface; if the account has no legendary.player_profiles row
  // yet, getOwnerProfile synthesizes the default profile view and
  // overlays the freshly-written links per the read-no-mutate
  // invariant.
  return getOwnerProfile(accountId, database);
}
