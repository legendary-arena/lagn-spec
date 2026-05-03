/**
 * Public Profile Logic — Server Layer (WP-102)
 *
 * Public functions for composing the read-only `PublicProfileView`
 * consumed by `apps/arena-client/src/pages/PlayerProfilePage.vue`
 * (via the `fetchPublicProfile` HTTP wrapper). All persistent
 * operations go through PostgreSQL via a caller-injected
 * `DatabaseClient` (`pg.Pool`); the pool is created at server
 * startup by a future request-handler WP and is not wired by this
 * packet (route registration deferred per WP-102 §H amendment).
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only
 * through the `DatabaseClient` alias; a direct `pg` import is
 * forbidden in this file.
 *
 * Read-only invariant: this module emits no `INSERT` / `UPDATE` /
 * `DELETE` SQL anywhere. Profile composition observes the rows
 * already written by WP-052 (`assignReplayOwnership`,
 * `updateReplayVisibility`) and WP-101 (`claimHandle`); it does not
 * write to `legendary.players` or `legendary.replay_ownership` from
 * any code path.
 *
 * Lifecycle prohibition (RISK #16): the two exported functions
 * MUST NOT be called from `game.ts`, any `LegendaryGame.moves`
 * entry, any phase hook, any file under `packages/`, any file
 * under `apps/replay-producer/` or `apps/registry-viewer/`, or
 * any file under `apps/server/src/{identity,replay,competition,par,
 * rules,game}/`. They are consumed only by `profile.logic.test.ts`,
 * by `profile.routes.ts`, and (transitively, via `fetchPublicProfile`)
 * by `apps/arena-client/src/pages/PlayerProfilePage.vue`.
 *
 * Authority: WP-102 §Scope (In) §B; EC-117 §Locked Values; D-5201
 * (AccountId is server-internal); D-5203 (identity persistence
 * taxonomy); pre-flight 2026-04-28 PS-5 (`ProfileResult<T>` declared
 * locally); copilot-check 2026-04-28 RISK #10 (per-row visibility
 * narrowing) and RISK #17 (aliasing prevention).
 */

import type {
  AccountId,
  DatabaseClient,
  PlayerAccount,
} from '../identity/identity.types.js';
import { findAccountByHandle, getHandleForAccount } from '../identity/handle.logic.js';

import type {
  ProfileResult,
  PublicProfileView,
  PublicReplaySummary,
} from './profile.types.js';
import { composeTeamAffiliationsForProfile } from '../teams/team.logic.js';

/**
 * Internal shape returned by the locked replay-filter SELECT. The
 * application layer narrows `visibility` per RISK #10 and maps each
 * row to a fresh `PublicReplaySummary` literal per RISK #17.
 */
interface PublicReplayRow {
  replay_hash: string;
  scenario_key: string;
  visibility: string;
  created_at: Date | string;
}

// why: WP-101's `findAccountByHandle` returns the full `PlayerAccount`
// shape keyed on `ext_id` / `AccountId`, but the FK on
// `legendary.replay_ownership` is the bigint `player_id` column on
// `legendary.players`. The two-step lookup keeps the WP-101 contract
// (`PlayerAccount` shape) unchanged while surfacing the bigint FK
// value the replay-filter SQL needs. Returning `null` on a missing
// row covers the race where the account row was deleted between the
// `findAccountByHandle` call and this query — the caller treats that
// as a 404 (no information leak distinguishing unclaimed vs deleted
// vs reserved).
/**
 * Resolve the bigint `player_id` for an `AccountId`. Returns `null`
 * when no `legendary.players` row matches the supplied `accountId`
 * (race against deletion). Pure read — no mutation.
 */
export async function loadPlayerIdByAccountId(
  accountId: AccountId,
  database: DatabaseClient,
): Promise<number | null> {
  const result = await database.query(
    'SELECT player_id ' +
      'FROM legendary.players ' +
      'WHERE ext_id = $1 ' +
      'LIMIT 1',
    [accountId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const rawId = result.rows[0].player_id;
  return typeof rawId === 'string' ? Number(rawId) : rawId;
}

// why: 404 / `player_not_found` is an expected, non-exceptional
// outcome — every handle starts unclaimed and many requests will
// target unclaimed values (mistyped, deleted-and-not-reclaimed,
// reserved). Returning `ProfileResult<T>` rather than throwing
// keeps the route adapter's response-mapping branch-free and
// avoids the cost of stack-unwinding on the common path.
// why: 404 information-leak discipline — every "no such handle"
// case (unclaimed, deleted-then-not-reclaimed, deleted-then-reclaimed-
// by-different-account-where-the-current-row-no-longer-matches the
// looked-up account between the two SELECTs) collapses to the same
// `code: 'player_not_found'` so the public surface cannot be probed
// to distinguish those states. Per WP-101 §"Public surfaces must not
// treat handle as a stable identity key", the no-tombstone policy
// requires this discipline.
// why: aliasing prevention (RISK #17) — `publicReplays` is built
// via an explicit `for...of` loop with a fresh `PublicReplaySummary`
// literal per row; the `pg`-driver `result.rows` array is never
// passed through, spread, or identity-mapped into the returned
// `PublicProfileView.publicReplays`. The returned view is a fresh
// literal per call so any future caching layer must `Object.freeze()`
// the cached value to preserve the invariant.
/**
 * Compose the public profile view for a handle. Canonicalizes input,
 * resolves the handle to a `PlayerAccount` via WP-101's
 * `findAccountByHandle`, fetches the bigint `player_id` for the
 * replay-ownership join, runs the locked replay-filter SQL keyed on
 * `player_id`, and returns a fresh `PublicProfileView` literal with
 * the four locked fields.
 *
 * Returns `{ ok: false, code: 'player_not_found' }` when the
 * canonicalized handle has no matching row in `legendary.players`,
 * or when the row was deleted between the handle lookup and the
 * `player_id` lookup (race). Both cases are indistinguishable to
 * the caller per the 404 information-leak discipline above.
 */
export async function getPublicProfileByHandle(
  rawHandle: string,
  database: DatabaseClient,
): Promise<ProfileResult<PublicProfileView>> {
  const canonical = rawHandle.trim().toLowerCase();
  const playerAccount: PlayerAccount | null = await findAccountByHandle(
    canonical,
    database,
  );
  if (playerAccount === null) {
    return {
      ok: false,
      reason: `No player has claimed the handle "${canonical}".`,
      code: 'player_not_found',
    };
  }
  const playerId = await loadPlayerIdByAccountId(
    playerAccount.accountId,
    database,
  );
  if (playerId === null) {
    return {
      ok: false,
      reason: `No player has claimed the handle "${canonical}".`,
      code: 'player_not_found',
    };
  }
  // why: option (b) per session-prompt §Implementation Task B — call
  // WP-101's `getHandleForAccount` to fetch the case-preserved
  // `display_handle` rather than folding it into
  // `loadPlayerIdByAccountId`'s SELECT (which is locked to
  // `SELECT player_id ... LIMIT 1` per §Locked Values). Costs one
  // extra round-trip; gains contract-faithful reuse of the WP-101
  // surface. If `getHandleForAccount` returns `null` (the handle
  // row was NULL-ed or deleted between the two SELECTs — forbidden
  // by WP-101's immutability invariant but defensive), fall back to
  // `displayName` so the response remains structurally valid; the
  // 404-information-leak discipline above still holds because the
  // handle is known to exist (we just resolved it).
  const handleRecord = await getHandleForAccount(
    playerAccount.accountId,
    database,
  );
  const displayHandle =
    handleRecord === null ? playerAccount.displayName : handleRecord.displayHandle;
  const result = await database.query(
    'SELECT replay_hash, scenario_key, visibility, created_at ' +
      'FROM legendary.replay_ownership ' +
      'WHERE player_id = $1 ' +
      "  AND visibility IN ('public', 'link') " +
      '  AND (expires_at IS NULL OR expires_at > now()) ' +
      'ORDER BY created_at DESC',
    [playerId],
  );
  const publicReplays: PublicReplaySummary[] = [];
  for (const row of result.rows as PublicReplayRow[]) {
    // why: the SQL visibility filter above is the authoritative gate;
    // this app-layer guard is defense-in-depth so the type-level
    // exclusion of `private` on PublicReplaySummary survives any
    // future SQL relaxation (e.g., a not-equal-private rewrite that
    // would also include unknown future values). RISK #10 fix from
    // copilot-check 2026-04-28.
    if (row.visibility !== 'public' && row.visibility !== 'link') {
      continue;
    }
    publicReplays.push({
      replayHash: row.replay_hash,
      scenarioKey: row.scenario_key,
      visibility: row.visibility,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    });
  }
  // why: WP-109 §7 — compose teamAffiliations[] via the shared helper
  // in team.logic.ts. The viewer is null for unauthenticated public
  // reads (no cookie-based viewer ID inference per WP-104 D-11202
  // bearer-only auth lock + EC-115 §AI Agent Warning #5); only
  // 'public'-visibility teams will return for anonymous readers.
  // The friend-graph service is undefined until a future WP lands,
  // so 'friends'-visibility teams collapse to 'private' semantics
  // server-side per OQ-1 = (a) / D-10901 + EC-115 Guardrail 6.
  const teamAffiliations = await composeTeamAffiliationsForProfile(
    database,
    String(playerId),
    null,
    undefined,
  );
  return {
    ok: true,
    value: {
      handleCanonical: canonical,
      displayHandle,
      displayName: playerAccount.displayName,
      publicReplays,
      teamAffiliations: [...teamAffiliations],
    },
  };
}
