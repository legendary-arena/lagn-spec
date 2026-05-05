/**
 * Entitlements Logic — Server Layer (WP-132)
 *
 * Single read-only library export: `getEntitlementsForAccount`. The
 * function maps an `AccountId` to the active entitlement set for the
 * underlying `legendary.players` row using the standard two-query
 * pattern (mirrors WP-104 `loadPlayerIdByAccountId` +
 * apps/server/src/profile/ownerProfile.logic.ts:123). WP-132 ships
 * ZERO write path against `legendary.entitlements` — WP-134 (Stripe
 * webhook + fulfillment) owns the row-creation site, and revocation
 * is a future-WP responsibility.
 *
 * Authority: WP-132 §Scope (In) §A; EC-135 §2 (two-query helper
 * pattern lock + ordering invariant + revoked-row exclusion);
 * D-13201 (module path); D-13203 (EntitlementKey closed set);
 * D-13204 (source closed set); WP-052 D-5201 (`AccountId` ↔
 * `ext_id`); WP-104 D-10402 + WP-109 D-10906 (`bigint`-FK-on-
 * `player_id` precedent).
 */

import type {
  AccountId,
  DatabaseClient,
  Entitlement,
  EntitlementKey,
  EntitlementSource,
  EntitlementsResult,
} from './entitlements.types.js';

/**
 * Resolve the active entitlement set for an `AccountId`. Read-only;
 * no mutation site against `legendary.entitlements` exists in this
 * file by WP-132 construction.
 *
 * Two queries, in this order, no parallelization:
 *
 *   1. `SELECT player_id FROM legendary.players WHERE ext_id = $1
 *      LIMIT 1` — maps the supplied `AccountId` (= `ext_id text`)
 *      to the `bigint player_id` PK. Zero-row → `Result.fail({ code:
 *      'lookup_failed' })`. Thrown error → same.
 *
 *   2. `SELECT entitlement_key, source, source_ref, granted_at,
 *      revoked_at FROM legendary.entitlements WHERE player_id = $1
 *      AND revoked_at IS NULL ORDER BY granted_at ASC` — fetches
 *      active entitlements ordered oldest-first (PUBLIC CONTRACT —
 *      consumers MAY rely on stable iteration order). Thrown error →
 *      `Result.fail({ code: 'lookup_failed' })`.
 *
 * The function NEVER throws — every failure path returns a typed
 * `Result.fail`.
 */
export async function getEntitlementsForAccount(
  accountId: AccountId,
  database: DatabaseClient,
): Promise<EntitlementsResult<Entitlement[]>> {
  // why: Step 1 — map `AccountId` (= `ext_id text` per WP-052
  // D-5201) to the `bigint player_id` PK. Mirrors the WP-104 /
  // WP-109 two-query pattern verbatim
  // (apps/server/src/profile/ownerProfile.logic.ts:123). Step 1
  // zero-row indicates a database inconsistency or a race against
  // account deletion — the upstream orchestrator
  // (`requireAuthenticatedSession`) already validated account
  // existence by the time this helper runs, so a miss here is
  // operationally identical to a fault and maps to `'lookup_failed'`.
  let playerId: number;
  try {
    const playerResult = await database.query(
      'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
      [accountId],
    );
    if (playerResult.rows.length === 0) {
      return {
        ok: false,
        reason:
          'getEntitlementsForAccount could not resolve the supplied accountId to a legendary.players row; the account may have been deleted between session validation and this query.',
        code: 'lookup_failed',
      };
    }
    const rawId = playerResult.rows[0].player_id;
    playerId = typeof rawId === 'string' ? Number(rawId) : rawId;
  } catch {
    return {
      ok: false,
      reason:
        'getEntitlementsForAccount failed at the legendary.players Step 1 lookup; check database connectivity and the legendary.players schema integrity.',
      code: 'lookup_failed',
    };
  }

  // why: Step 2 — fetch active entitlements keyed on the `bigint
  // player_id` resolved in Step 1. The literal `WHERE revoked_at IS
  // NULL` clause makes revoked rows invisible to the read endpoint
  // by contract — the wire-form `revokedAt` field is therefore
  // always `null` on the success path. WP-132 ships zero write path
  // against this table by construction; row creation is WP-134's
  // scope and revocation is a future-WP responsibility, so the read
  // surface is purely a function of rows the database carries.
  // The literal `ORDER BY granted_at ASC` clause is the PUBLIC
  // CONTRACT ordering invariant — consumers MAY rely on stable
  // oldest-first iteration order for deterministic rendering.
  try {
    const entitlementsResult = await database.query(
      'SELECT entitlement_key, source, source_ref, granted_at, revoked_at FROM legendary.entitlements WHERE player_id = $1 AND revoked_at IS NULL ORDER BY granted_at ASC',
      [playerId],
    );
    const entitlements: Entitlement[] = entitlementsResult.rows.map((row) => ({
      entitlementKey: row.entitlement_key as EntitlementKey,
      source: row.source as EntitlementSource,
      sourceRef: row.source_ref ?? null,
      grantedAt:
        row.granted_at instanceof Date
          ? row.granted_at.toISOString()
          : String(row.granted_at),
      revokedAt: null,
    }));
    return { ok: true, value: entitlements };
  } catch {
    return {
      ok: false,
      reason:
        'getEntitlementsForAccount failed at the legendary.entitlements Step 2 lookup; check database connectivity and the legendary.entitlements schema integrity.',
      code: 'lookup_failed',
    };
  }
}
