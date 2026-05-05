/**
 * Production Account Resolver — Server Layer (WP-131)
 *
 * Single named export `productionAccountResolver` is the production
 * implementation of the WP-112 `AccountResolver` interface. The
 * orchestrator (`requireAuthenticatedSession` in
 * `sessionToken.logic.ts`) calls this resolver after the verifier
 * accepts a session token, passing the resulting
 * `VerifiedSessionClaim` plus the long-lived `DatabaseClient`. The
 * resolver delegates to WP-112's
 * `findAccountByAuthProviderSub(authProvider, authProviderSub,
 * database)` (signature locked by D-11203) and remaps the row payload
 * to the bare `AccountId | null` shape the orchestrator expects.
 *
 * Failure-path contract: every failure path returns a typed `Result`;
 * Database faults are forwarded verbatim from
 * `findAccountByAuthProviderSub` (`Result.fail({ code:
 * 'lookup_failed', reason })`) per D-11203. The orchestrator's
 * translation site at `sessionToken.logic.ts:188-194` is the single
 * site that maps `'lookup_failed'` to the route-layer 500 / 401
 * response — adding a second mapping site here would split the
 * error-code surface.
 *
 * `AccountLookupHit → AccountId | null` translation locality: the
 * row → `AccountId` projection happens at exactly one site (the
 * `Result.ok(hit)` branch below). The resolver drops the
 * `authProvider` and `authProviderId` fields the orchestrator does
 * not need; future consumers that want the full row continue to
 * call `findAccountByAuthProviderSub` directly.
 *
 * Layer-boundary contract: this module's forbidden-import surface
 * mirrors the WP-112 `accountLookup.logic.ts` precedent verbatim.
 * Type imports come from the sibling auth + identity types modules;
 * the `pg.Pool` is reachable only through the `DatabaseClient`
 * alias. WP-099 D-9904 confines broker-specific code to a sibling
 * subdirectory which this file does not touch.
 *
 * Authority: WP-131 §A; WP-112 D-11203 (`findAccountByAuthProviderSub`
 * signature lock — positional args, `Result<HitOrNull>` shape,
 * `'lookup_failed'` on DB error, `Result.ok(null)` on no match);
 * WP-126 (verifier consumer of this resolver via the orchestrator's
 * `accountResolver` slot at `sessionToken.logic.ts:188-194`).
 */

import { findAccountByAuthProviderSub } from './accountLookup.logic.js';
import type {
  AccountResolver,
  VerifiedSessionClaim,
} from './sessionToken.types.js';
import type {
  AccountId,
  DatabaseClient,
  Result,
} from '../identity/identity.types.js';

/**
 * Production wiring of the WP-112 `AccountResolver` contract. Calls
 * `findAccountByAuthProviderSub(claim.authProvider,
 * claim.authProviderSub, database)` and remaps:
 *
 * - `Result.fail({ code: 'lookup_failed', reason })` → forwarded
 *   verbatim (preserves the failure code AND reason per D-11203).
 * - `Result.ok(null)` → `Result.ok(null)` (the orchestrator
 *   translates the `null` payload to `'unknown_account'` at
 *   `sessionToken.logic.ts:211-218`).
 * - `Result.ok(hit)` → `Result.ok(hit.accountId)` (drops
 *   `authProvider` + `authProviderId`).
 *
 * Never throws. The resolver is a pure mapping over the lookup
 * helper's `Result`; all failure surfaces are typed.
 */
export const productionAccountResolver: AccountResolver = async (
  claim: VerifiedSessionClaim,
  database: DatabaseClient,
): Promise<Result<AccountId | null>> => {
  // why: no-mutation map — the lookup helper already wraps the
  // database call and returns `Result.fail({ code: 'lookup_failed' })`
  // on any fault per D-11203. Forwarding the failure verbatim keeps
  // the orchestrator's translation site at
  // `sessionToken.logic.ts:188-194` the SOLE error-code-mapping site;
  // re-wrapping here would either double-translate the code or
  // shadow the underlying reason text.
  const lookupResult = await findAccountByAuthProviderSub(
    claim.authProvider,
    claim.authProviderSub,
    database,
  );
  if (lookupResult.ok === false) {
    return lookupResult;
  }
  if (lookupResult.value === null) {
    return { ok: true, value: null };
  }
  return { ok: true, value: lookupResult.value.accountId };
};
