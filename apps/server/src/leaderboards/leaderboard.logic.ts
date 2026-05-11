/**
 * Public Leaderboard Logic — Server Layer (WP-054)
 *
 * Read-only projections from `legendary.competitive_scores`. Every
 * function in this module issues SELECT queries only; per the
 * D-5302-equivalent read-only contract for this packet, no
 * write-side SQL appears here. Truth originates in WP-053
 * verified records — leaderboards are derived views, never the
 * source of authority. The server layer's role here is
 * orchestration and filtering, not score calculation: the engine
 * already produced and stored the final score at submission time
 * per D-5301; this module never re-derives it.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, the engine's runtime surface,
 * or any sibling server domain (`apps/server/src/competition/**`,
 * `apps/server/src/identity/**`, `apps/server/src/replay/**`,
 * `apps/server/src/par/**`). The PAR gate is consumed exclusively
 * through the injected `LeaderboardDependencies.checkParPublished`
 * seam; the bare 3-arg module function at
 * `apps/server/src/par/parGate.mjs:83` is never imported here.
 *
 * Lifecycle prohibition: none of these helpers are called from
 * `game.ts` / phase hooks / `server.mjs` / `index.mjs` / any
 * `apps/arena-client/**` / `apps/replay-producer/**` /
 * `apps/registry-viewer/**` / `packages/**` file. They are consumed
 * only by the colocated test file in this packet. The future
 * request-handler WP wires them as HTTP endpoints and owns the
 * transport, content-type negotiation, CORS, cache-control, and
 * stateless IP-based throttling concerns that are deliberately
 * absent here.
 *
 * Authority: WP-054 §B; EC-054 §Locked Values; D-5201 (server
 * identity is `AccountId`); D-5301 (server is enforcer / projector,
 * not calculator); D-5302 (competitive records are write-once);
 * D-5306 Option A (`scoringConfig` flows from PAR artifact —
 * leaderboard reads consult only `parValue` presence).
 */

import type {
  DatabaseClient,
  GlobalTopLeaderboard,
  GlobalTopLeaderboardQueryOptions,
  LeaderboardDependencies,
  LeaderboardQueryOptions,
  PublicLeaderboardEntry,
  ScenarioLeaderboard,
  ThemeLeaderboard,
  ThemeLeaderboardQueryOptions,
} from './leaderboard.types.js';

// ---------------------------------------------------------------------------
// Production dependencies (fail-closed default)
// ---------------------------------------------------------------------------

// why: PRODUCTION_DEPENDENCIES.checkParPublished defaults to () => null
// (fail-closed). Until the future request-handler WP wires the real
// bound `createParGate(...).checkParPublished` at server startup,
// every `getScenarioLeaderboard` call against this default returns
// an empty leaderboard. The Lifecycle Prohibition makes this safe —
// no production caller exists today; the only consumer is the
// colocated test file, which passes its own stub `deps`. Mirrors
// the WP-053 PRODUCTION_DEPENDENCIES pattern at
// apps/server/src/competition/competition.logic.ts:156.
// why: getScenarioKeysForTheme defaults to () => null (fail-closed
// per D-15002). Until server.mjs binds the real function built from
// the startup-loaded content/themes/*.json set, every theme route
// resolves to a 404 by construction. The route layer translates the
// null return into the locked 404 envelope — production callers
// MUST inject the real binding for the endpoint to surface non-404
// responses. Same fail-closed posture as checkParPublished.
export const PRODUCTION_DEPENDENCIES: LeaderboardDependencies = {
  checkParPublished: () => null,
  getScenarioKeysForTheme: () => null,
};

// ---------------------------------------------------------------------------
// Internal row shape and mapper
// ---------------------------------------------------------------------------

/**
 * Internal shape returned by every leaderboard SELECT in this
 * module. Column names are snake_case to match the underlying
 * `legendary.competitive_scores` schema; the application layer
 * converts to camelCase at the row mapper. `bigserial` /
 * `timestamptz` codec coercions follow the WP-053 / WP-052
 * precedent — `pg` may emit either `number | string` for
 * bigserial-derived values and either `Date | string` for
 * timestamps depending on driver configuration.
 */
interface LeaderboardRow {
  replay_hash: string;
  player_display_name: string;
  scenario_key: string;
  final_score: number;
  raw_score: number;
  par_version: string;
  scoring_config_version: number;
  created_at: Date | string;
}

// why: every `PublicLeaderboardEntry` returned to a caller is a
// fresh object literal — never a held reference into the pg
// rowset, an internal cache, or a request-scoped buffer.
// Returning a held reference would let a caller mutate state
// through the projection (the same aliasing failure mode that
// produced the apps/server/src/par/parGate.mjs:92-106 fresh-literal
// guard). Consumers see a flat copy and can freely freeze, sort,
// or filter the returned array without affecting any other call.
function mapRowToEntry(
  row: LeaderboardRow,
  rank: number,
): PublicLeaderboardEntry {
  return {
    rank,
    replayHash: row.replay_hash,
    playerDisplayName: row.player_display_name,
    scenarioKey: row.scenario_key,
    finalScore: row.final_score,
    rawScore: row.raw_score,
    parVersion: row.par_version,
    scoringConfigVersion: row.scoring_config_version,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Return a paginated public leaderboard for a single scenario.
 *
 * Steps:
 *   1. Consult the injected PAR gate. If `checkParPublished` returns
 *      `null` for `options.scenarioKey`, the scenario has no
 *      published PAR yet — return an empty leaderboard (fail-closed
 *      per D-5306). Never partial, never inferred.
 *   2. Issue the locked SELECT against `legendary.competitive_scores`,
 *      INNER-joined to `legendary.players` (for display name) and to
 *      `legendary.replay_ownership` (for visibility), filtered to
 *      visibility IN ('link', 'public'), ordered by
 *      `final_score ASC, created_at ASC` (deterministic; ties broken
 *      by earliest submission), with LIMIT/OFFSET pagination.
 *   3. Issue a parallel COUNT(*) using the SAME WHERE clause and the
 *      SAME INNER JOINs so `totalEligibleEntries` reflects the
 *      filtered universe — never an unfiltered table count.
 *   4. Map each row to a fresh `PublicLeaderboardEntry`; compute
 *      `rank = options.offset + i + 1` so rank reflects the global
 *      position within eligible results, not the page-local index.
 *   5. Return a fresh `ScenarioLeaderboard` literal.
 *
 * Never throws for any expected condition (missing PAR, no eligible
 * scores, unknown scenario key all return an empty leaderboard).
 * Only infrastructure-level errors (connection lost, malformed SQL)
 * propagate as exceptions — those signal misconfiguration, not a
 * caller error.
 */
export async function getScenarioLeaderboard(
  options: LeaderboardQueryOptions,
  database: DatabaseClient,
  deps: LeaderboardDependencies = PRODUCTION_DEPENDENCIES,
): Promise<ScenarioLeaderboard> {
  // why: PAR-missing returns empty leaderboard, not an error. Per
  // D-5306 Option A, `parValue` presence is the gate; the gate is
  // either fully published (every scenario has parValue + version
  // + source + scoringConfig) or absent. The request-handler WP
  // will wire the real bound gate; until then this short-circuits
  // before any DB I/O on the production fail-closed path.
  const parGateHit = deps.checkParPublished(options.scenarioKey);
  if (parGateHit === null) {
    return {
      scenarioKey: options.scenarioKey,
      entries: [],
      totalEligibleEntries: 0,
    };
  }

  const pageResult = await database.query(
    'SELECT cs.replay_hash, p.display_name AS player_display_name, ' +
      'cs.scenario_key, cs.final_score, cs.raw_score, ' +
      'cs.par_version, cs.scoring_config_version, cs.created_at ' +
      'FROM legendary.competitive_scores cs ' +
      'INNER JOIN legendary.players p ON cs.player_id = p.player_id ' +
      'INNER JOIN legendary.replay_ownership ro ' +
      '  ON ro.player_id = cs.player_id AND ro.replay_hash = cs.replay_hash ' +
      "WHERE cs.scenario_key = $1 " +
      "  AND ro.visibility IN ('link', 'public') " +
      'ORDER BY cs.final_score ASC, cs.created_at ASC ' +
      'LIMIT $2 OFFSET $3',
    [options.scenarioKey, options.limit, options.offset],
  );

  const countResult = await database.query(
    'SELECT COUNT(*) AS total ' +
      'FROM legendary.competitive_scores cs ' +
      'INNER JOIN legendary.players p ON cs.player_id = p.player_id ' +
      'INNER JOIN legendary.replay_ownership ro ' +
      '  ON ro.player_id = cs.player_id AND ro.replay_hash = cs.replay_hash ' +
      "WHERE cs.scenario_key = $1 " +
      "  AND ro.visibility IN ('link', 'public')",
    [options.scenarioKey],
  );

  // why: rank reflects global ordering within eligible results
  // (offset + i + 1), never the index within the returned page.
  // Page-local indices would mislead callers on every page after
  // the first; global rank lets a UI render "12th of 4,302"
  // correctly regardless of pagination cursor.
  const entries: PublicLeaderboardEntry[] = [];
  for (let rowIndex = 0; rowIndex < pageResult.rows.length; rowIndex = rowIndex + 1) {
    const rank = options.offset + rowIndex + 1;
    entries.push(mapRowToEntry(pageResult.rows[rowIndex] as LeaderboardRow, rank));
  }

  // why: pg's COUNT(*) is emitted as `string` (bigint codec)
  // regardless of driver configuration. Coerce explicitly so
  // `totalEligibleEntries` is always a JS `number` per the
  // ScenarioLeaderboard contract.
  const totalRaw = countResult.rows[0]?.total;
  const totalEligibleEntries =
    typeof totalRaw === 'string' ? Number(totalRaw) : (totalRaw ?? 0);

  return {
    scenarioKey: options.scenarioKey,
    entries,
    totalEligibleEntries,
  };
}

/**
 * Look up a single public leaderboard entry by its cryptographic
 * replay hash. Used by permalink consumers (share links, embedded
 * widgets, profile-page deep links). Returns `null` when no row
 * matches the hash, when the owning replay's visibility is
 * `'private'`, or when the JOIN filters out the row for any other
 * structural reason.
 *
 * Returns the entry with `rank: 0` — rank is meaningless for a
 * single-record permalink lookup, so the field exists for type
 * uniformity only and consumers should ignore it. The PAR gate is
 * NOT consulted here: the score's existence in
 * `legendary.competitive_scores` already implies it passed PAR at
 * submission time per WP-053's flow.
 */
export async function getPublicScoreByReplayHash(
  replayHash: string,
  database: DatabaseClient,
): Promise<PublicLeaderboardEntry | null> {
  const result = await database.query(
    'SELECT cs.replay_hash, p.display_name AS player_display_name, ' +
      'cs.scenario_key, cs.final_score, cs.raw_score, ' +
      'cs.par_version, cs.scoring_config_version, cs.created_at ' +
      'FROM legendary.competitive_scores cs ' +
      'INNER JOIN legendary.players p ON cs.player_id = p.player_id ' +
      'INNER JOIN legendary.replay_ownership ro ' +
      '  ON ro.player_id = cs.player_id AND ro.replay_hash = cs.replay_hash ' +
      'WHERE cs.replay_hash = $1 ' +
      "  AND ro.visibility IN ('link', 'public') " +
      'LIMIT 1',
    [replayHash],
  );

  if (result.rows.length === 0) {
    return null;
  }

  // why: rank: 0 is the contractual sentinel for permalink lookups
  // — single-record context has no global position to report
  // without re-querying every row of the same scenario, which the
  // permalink surface does not do (callers wanting rank context
  // call `getScenarioLeaderboard` instead). Field exists for type
  // uniformity with the paginated entries.
  return mapRowToEntry(result.rows[0] as LeaderboardRow, 0);
}

/**
 * Return the alphabetically sorted list of scenario keys that have
 * at least one publicly visible (`'link'` or `'public'`) verified
 * competitive score. Used by discoverability surfaces (scenario
 * picker dropdowns, profile-page filters, future board UI).
 *
 * Does NOT consult `checkParPublished` — per-scenario PAR filtering
 * is the future request-handler WP's concern (e.g., omit scenarios
 * whose PAR has been retracted). This surface is the more
 * permissive "every scenario with at least one publicly visible
 * verified score" view; callers compose stricter filters on top.
 */
export async function listScenarioKeys(
  database: DatabaseClient,
): Promise<string[]> {
  // why: alphabetical sort gives every consumer a deterministic
  // ordering without coupling to insertion time, scenario rarity,
  // or any UI-shaped ordering decision. Lexicographic ordering on
  // the canonical key is the most boring choice — and the
  // boring-choice principle from .claude/rules/code-style.md
  // applies: explicit, deterministic, no opinion encoded in the
  // sort.
  const result = await database.query(
    'SELECT DISTINCT cs.scenario_key ' +
      'FROM legendary.competitive_scores cs ' +
      'INNER JOIN legendary.replay_ownership ro ' +
      '  ON ro.player_id = cs.player_id AND ro.replay_hash = cs.replay_hash ' +
      "WHERE ro.visibility IN ('link', 'public') " +
      'ORDER BY cs.scenario_key ASC',
  );

  const scenarioKeys: string[] = [];
  for (const row of result.rows) {
    scenarioKeys.push((row as { scenario_key: string }).scenario_key);
  }
  return scenarioKeys;
}

/**
 * Return a paginated public leaderboard across every scenario that
 * belongs to a given theme (per WP-055 `ThemeDefinition.themeId` and
 * the curated `setupIntent` projection locked under D-15001).
 *
 * Steps:
 *   1. Resolve `themeId → scenarioKey[]` via `deps.getScenarioKeysForTheme`.
 *      If the dep is omitted (production wiring forgot the binding) or
 *      returns `null` (unknown themeId), return `null` — the route
 *      surface translates to the locked `theme_not_found` 404. This
 *      is the fail-closed posture per D-15002.
 *   2. Filter the resolved scenarioKey list to PAR-published only by
 *      calling `deps.checkParPublished(scenarioKey)` per key (the
 *      same fail-closed gate the per-scenario surface already uses
 *      per D-5306 Option A). Scenarios without published PAR
 *      contribute zero rows.
 *   3. If every scenarioKey filtered out (PAR not published for any
 *      of the theme's scenarios), return a fresh `ThemeLeaderboard`
 *      with empty entries and `totalEligibleEntries: 0`. The themeId
 *      itself was valid — the route returns 200 with the empty
 *      payload, never 404.
 *   4. Issue the locked SELECT against `legendary.competitive_scores`,
 *      INNER-joined to `legendary.players` (display name) + to
 *      `legendary.replay_ownership` (visibility), filtered to
 *      `cs.scenario_key = ANY($1)` + `ro.visibility IN ('link', 'public')`,
 *      ordered by `final_score ASC, created_at ASC` (byte-identical
 *      comparator to `getScenarioLeaderboard` — determinism shared
 *      across the family), with LIMIT/OFFSET pagination.
 *   5. Issue a parallel COUNT(*) using the SAME WHERE clause so
 *      `totalEligibleEntries` reflects the filtered universe.
 *   6. Map each row to a fresh `PublicLeaderboardEntry` (aliasing
 *      defense — never alias the pg rowset reference); compute
 *      `rank = options.offset + i + 1` so rank reflects the global
 *      position within eligible results, not the page-local index.
 *   7. Return a fresh `ThemeLeaderboard` literal.
 *
 * Never throws for any expected condition (missing dep, unknown
 * themeId, empty PAR filter, no eligible scores all return either
 * `null` or an empty leaderboard). Only infrastructure-level errors
 * (connection lost, malformed SQL) propagate as exceptions.
 */
export async function getThemeLeaderboard(
  options: ThemeLeaderboardQueryOptions,
  database: DatabaseClient,
  deps: LeaderboardDependencies = PRODUCTION_DEPENDENCIES,
): Promise<ThemeLeaderboard | null> {
  // why: dep-missing returns null (route → 404), not an empty
  // leaderboard. The distinction matters: an unknown themeId must
  // be observably different from "known themeId, no PAR-published
  // scenarios" — the former is 404 (client error), the latter is
  // 200 with empty entries (no data yet). Per D-15002, production
  // wiring binds the real function; tests pass inline stubs; the
  // PRODUCTION_DEPENDENCIES default fail-closes to null so a
  // wiring omission surfaces as 404 by construction.
  if (deps.getScenarioKeysForTheme === undefined) {
    return null;
  }
  const themeScenarioKeys = deps.getScenarioKeysForTheme(options.themeId);
  if (themeScenarioKeys === null) {
    return null;
  }

  // why: PAR-eligibility filter applied in application code rather
  // than SQL because checkParPublished is an in-memory Map.get per
  // scenario (parGate is loaded at startup per WP-051 / D-5101) —
  // a JOIN against the PAR table would be slower AND the PAR
  // surface is intentionally not a SQL table (the PAR artifact set
  // is files-on-disk per D-5101). for...of over scenarios per
  // .claude/rules/code-style.md (no .reduce() for branching logic).
  const eligibleScenarioKeys: string[] = [];
  for (const scenarioKey of themeScenarioKeys) {
    const parGateHit = deps.checkParPublished(scenarioKey);
    if (parGateHit !== null) {
      eligibleScenarioKeys.push(scenarioKey);
    }
  }

  if (eligibleScenarioKeys.length === 0) {
    return {
      themeId: options.themeId,
      entries: [],
      totalEligibleEntries: 0,
    };
  }

  const pageResult = await database.query(
    'SELECT cs.replay_hash, p.display_name AS player_display_name, ' +
      'cs.scenario_key, cs.final_score, cs.raw_score, ' +
      'cs.par_version, cs.scoring_config_version, cs.created_at ' +
      'FROM legendary.competitive_scores cs ' +
      'INNER JOIN legendary.players p ON cs.player_id = p.player_id ' +
      'INNER JOIN legendary.replay_ownership ro ' +
      '  ON ro.player_id = cs.player_id AND ro.replay_hash = cs.replay_hash ' +
      'WHERE cs.scenario_key = ANY($1) ' +
      "  AND ro.visibility IN ('link', 'public') " +
      'ORDER BY cs.final_score ASC, cs.created_at ASC ' +
      'LIMIT $2 OFFSET $3',
    [eligibleScenarioKeys, options.limit, options.offset],
  );

  const countResult = await database.query(
    'SELECT COUNT(*) AS total ' +
      'FROM legendary.competitive_scores cs ' +
      'INNER JOIN legendary.players p ON cs.player_id = p.player_id ' +
      'INNER JOIN legendary.replay_ownership ro ' +
      '  ON ro.player_id = cs.player_id AND ro.replay_hash = cs.replay_hash ' +
      'WHERE cs.scenario_key = ANY($1) ' +
      "  AND ro.visibility IN ('link', 'public')",
    [eligibleScenarioKeys],
  );

  const entries: PublicLeaderboardEntry[] = [];
  for (let rowIndex = 0; rowIndex < pageResult.rows.length; rowIndex = rowIndex + 1) {
    const rank = options.offset + rowIndex + 1;
    entries.push(mapRowToEntry(pageResult.rows[rowIndex] as LeaderboardRow, rank));
  }

  const totalRaw = countResult.rows[0]?.total;
  const totalEligibleEntries =
    typeof totalRaw === 'string' ? Number(totalRaw) : (totalRaw ?? 0);

  return {
    themeId: options.themeId,
    entries,
    totalEligibleEntries,
  };
}

/**
 * Return the paginated global Top-N leaderboard across every
 * PAR-published scenario (per D-15003). Used by the marketing-site
 * public-leaderboard page to surface the lowest `final_score`
 * entries regardless of scenario or theme.
 *
 * Steps:
 *   1. Discover the eligible scenario universe via `listScenarioKeys`
 *      (already exported by WP-054). The returned list is every
 *      scenario with at least one publicly visible verified score.
 *   2. Filter to PAR-published only via `deps.checkParPublished`
 *      per scenario (D-5306 fail-closed). Scenarios without PAR
 *      contribute zero rows.
 *   3. If no scenario survives the PAR filter, return a fresh
 *      `GlobalTopLeaderboard` with empty entries and
 *      `totalEligibleEntries: 0` (200 with empty payload, never
 *      404 — there is no "not found" semantic on the global route).
 *   4. Issue the locked paginated SELECT with
 *      `cs.scenario_key = ANY($1)` + visibility filter, ordered by
 *      `final_score ASC, created_at ASC` (byte-identical comparator
 *      to `getScenarioLeaderboard` / `getThemeLeaderboard`).
 *   5. Issue a parallel COUNT(*) under the SAME WHERE clause.
 *   6. Map each row to a fresh `PublicLeaderboardEntry` (aliasing
 *      defense); compute `rank = options.offset + i + 1`.
 *   7. Return a fresh `GlobalTopLeaderboard` literal.
 *
 * Never throws for any expected condition (no PAR-published
 * scenarios, no eligible scores both return an empty leaderboard).
 * Only infrastructure-level errors propagate as exceptions.
 */
export async function getGlobalTopLeaderboard(
  options: GlobalTopLeaderboardQueryOptions,
  database: DatabaseClient,
  deps: LeaderboardDependencies = PRODUCTION_DEPENDENCIES,
): Promise<GlobalTopLeaderboard> {
  const allScenarioKeys = await listScenarioKeys(database);

  // why: PAR-eligibility filter in application code, identical
  // posture to getThemeLeaderboard. for...of per
  // .claude/rules/code-style.md.
  const eligibleScenarioKeys: string[] = [];
  for (const scenarioKey of allScenarioKeys) {
    const parGateHit = deps.checkParPublished(scenarioKey);
    if (parGateHit !== null) {
      eligibleScenarioKeys.push(scenarioKey);
    }
  }

  if (eligibleScenarioKeys.length === 0) {
    return {
      entries: [],
      totalEligibleEntries: 0,
    };
  }

  const pageResult = await database.query(
    'SELECT cs.replay_hash, p.display_name AS player_display_name, ' +
      'cs.scenario_key, cs.final_score, cs.raw_score, ' +
      'cs.par_version, cs.scoring_config_version, cs.created_at ' +
      'FROM legendary.competitive_scores cs ' +
      'INNER JOIN legendary.players p ON cs.player_id = p.player_id ' +
      'INNER JOIN legendary.replay_ownership ro ' +
      '  ON ro.player_id = cs.player_id AND ro.replay_hash = cs.replay_hash ' +
      'WHERE cs.scenario_key = ANY($1) ' +
      "  AND ro.visibility IN ('link', 'public') " +
      'ORDER BY cs.final_score ASC, cs.created_at ASC ' +
      'LIMIT $2 OFFSET $3',
    [eligibleScenarioKeys, options.limit, options.offset],
  );

  const countResult = await database.query(
    'SELECT COUNT(*) AS total ' +
      'FROM legendary.competitive_scores cs ' +
      'INNER JOIN legendary.players p ON cs.player_id = p.player_id ' +
      'INNER JOIN legendary.replay_ownership ro ' +
      '  ON ro.player_id = cs.player_id AND ro.replay_hash = cs.replay_hash ' +
      'WHERE cs.scenario_key = ANY($1) ' +
      "  AND ro.visibility IN ('link', 'public')",
    [eligibleScenarioKeys],
  );

  const entries: PublicLeaderboardEntry[] = [];
  for (let rowIndex = 0; rowIndex < pageResult.rows.length; rowIndex = rowIndex + 1) {
    const rank = options.offset + rowIndex + 1;
    entries.push(mapRowToEntry(pageResult.rows[rowIndex] as LeaderboardRow, rank));
  }

  const totalRaw = countResult.rows[0]?.total;
  const totalEligibleEntries =
    typeof totalRaw === 'string' ? Number(totalRaw) : (totalRaw ?? 0);

  return {
    entries,
    totalEligibleEntries,
  };
}
