/**
 * Production Account Resolver — Server Layer (WP-131 + WP-174)
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
 * WP-174 extension: on the no-match branch (lookup returns null), the
 * resolver attempts first-sign-in auto-provisioning via
 * `provisionPlayerAccount` when the claim carries a usable email.
 * If provisioning succeeds, the new `AccountId` is returned; if the
 * email is missing or the INSERT conflicts on `duplicate_email`, the
 * resolver returns `Result.ok(null)` (preserving the existing
 * `'unknown_account'` path for the orchestrator to handle).
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
 * Layer-boundary contract: this module's forbidden-import surface
 * mirrors the WP-112 `accountLookup.logic.ts` precedent verbatim.
 * Type imports come from the sibling auth + identity types modules;
 * the `pg.Pool` is reachable only through the `DatabaseClient`
 * alias. WP-099 D-9904 confines broker-specific code to a sibling
 * subdirectory which this file does not touch.
 *
 * Authority: WP-131 §A; WP-174 §C (read-or-create resolver contract);
 * WP-112 D-11203 (`findAccountByAuthProviderSub` signature lock);
 * D-17401 (D-16006 supersession); D-17402 (provisioning helper design).
 */

import { findAccountByAuthProviderSub } from './accountLookup.logic.js';
import { provisionPlayerAccount } from './accountProvisioning.logic.js';
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
    return attemptProvisioning(claim, database);
  }
  return { ok: true, value: lookupResult.value.accountId };
};

/**
 * Attempt to provision a new player account when the lookup returned
 * no match. Returns `Result.ok(null)` (preserving the existing
 * `'unknown_account'` path) when the claim lacks a usable email.
 */
async function attemptProvisioning(
  claim: VerifiedSessionClaim,
  database: DatabaseClient,
): Promise<Result<AccountId | null>> {
  // why: reject garbage without full RFC 5322 validation — an `@`
  // is the minimal signal that this is an email-shaped string
  if (
    claim.email === undefined ||
    claim.email.trim().length === 0 ||
    claim.email.includes('@') === false
  ) {
    return { ok: true, value: null };
  }

  // why: normalize email + enforce deterministic display name derivation
  const normalizedEmail = claim.email.trim().toLowerCase();
  const displayName =
    claim.displayName && claim.displayName.trim().length > 0
      ? claim.displayName.trim().slice(0, 64)
      : normalizedEmail.split('@')[0].slice(0, 64);

  const provisionResult = await provisionPlayerAccount(
    {
      email: normalizedEmail,
      displayName,
      authProvider: claim.authProvider,
      authProviderId: claim.authProviderSub,
    },
    database,
  );

  if (provisionResult.ok === false) {
    const failCode = (provisionResult as { code: string }).code;

    // why: account-linking intentionally deferred — identity ambiguity
    // when the same email is registered under a different auth provider;
    // a separate account-linking WP is required to resolve collisions
    if (failCode === 'duplicate_email') {
      return { ok: true, value: null };
    }

    return { ok: false, reason: provisionResult.reason, code: failCode as never };
  }

  // why: observability for first-sign-in provisioning events —
  // the only diagnostic available for debugging onboarding issues
  // without inspecting DB rows directly
  console.info('[accountResolver] Provisioned new player account', {
    authProvider: claim.authProvider,
    accountId: provisionResult.value.accountId,
  });

  return { ok: true, value: provisionResult.value.accountId };
}
