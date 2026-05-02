/**
 * Session Token Types — Server Layer (WP-112)
 *
 * Broker-agnostic contracts for the session-token validation
 * orchestrator that future authenticated-route WPs consume. The
 * `SessionVerifier` interface is the single seam between the
 * orchestrator and a broker-specific verifier; the Hanko-specific
 * implementation is owned by WP-126 under
 * `apps/server/src/auth/hanko/` (path locked by WP-099 D-9904) and
 * MUST NOT leak symbols into this file.
 *
 * This module belongs to the server layer only. It must not be
 * imported from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `apps/arena-client/**`,
 * `apps/replay-producer/**`, or `apps/registry-viewer/**`. The engine
 * `PlayerId` (`packages/game-engine/src/types.ts`, plain `string`,
 * per D-8701) is unrelated to the server `AccountId` re-imported
 * here from the identity layer.
 *
 * `Result<T>`, `AccountId`, `AuthProvider`, and `DatabaseClient` are
 * re-imported from `../identity/identity.types.js` per the WP-052
 * D-5201 contract — never redeclared. A second declaration would
 * create a structurally compatible but nominally distinct type and
 * split the identity-layer caller surface (see WP-101's
 * `handle.types.ts` for the precedent that this file mirrors).
 *
 * Authority: WP-112 §Scope (In) §A; WP-099 §A (Session Validation
 * Middleware policy contract); WP-099 §C F-1..F-7 (Future-Auth
 * Gate); D-11201 (sibling-WP architectural choice — WP-112 ships
 * the orchestrator + interface; WP-126 ships the Hanko adapter);
 * D-11202 (token extraction source — bearer header only); D-11203
 * (`findAccountByAuthProviderSub` signature); D-11204
 * (unconfigured-default fail-closed).
 */

import type {
  AccountId,
  AuthProvider,
  DatabaseClient,
  Result,
} from '../identity/identity.types.js';

/**
 * Closed-union error codes emitted by a `SessionVerifier.verify`
 * implementation. Verifier-side codes are an internal contract
 * between the verifier and the orchestrator; they MUST NOT leak
 * verbatim to a caller of `requireAuthenticatedSession`. The
 * orchestrator translates each verifier code into a
 * `SessionValidationErrorCode` at exactly one site (the mapping
 * switch in `sessionToken.logic.ts`). Adding a new verifier-side
 * code requires updating both this union and the mapping site.
 */
export type SessionVerificationErrorCode =
  | 'invalid_token'
  | 'expired_token'
  | 'unknown_provider'
  | 'verification_failed';

/**
 * Closed-union error codes returned by `requireAuthenticatedSession`
 * to its callers (future request-handler WPs). This is the
 * orchestrator's public error surface; route-handler dispatch
 * matches on these values without parsing the prose `reason` field.
 * `'session_verifier_not_configured'` is the fail-closed code
 * emitted when production wiring hasn't injected a verifier (per
 * D-11204).
 */
export type SessionValidationErrorCode =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'unknown_account'
  | 'session_verifier_not_configured'
  | 'lookup_failed';

/**
 * Closed-union error codes returned by
 * `findAccountByAuthProviderSub`. Per D-11203 the lookup
 * distinguishes a clean no-match (returns `Result.ok(null)`) from a
 * database fault (returns `Result.fail({ code: 'lookup_failed' })`).
 * Single-value union today; future codes (e.g., a row-shape sanity
 * check) extend the union and the consuming switch in the
 * orchestrator together.
 */
export type AccountLookupErrorCode = 'lookup_failed';

// why: canonical readonly arrays paired with each closed union per
// `00.6-code-style.md §"Drift Detection"`. Drift-detection tests in
// the `.test.ts` siblings assert forward and backward inclusion
// against the union; adding or removing a code must touch both
// declarations in the same change.
/**
 * Canonical readonly array mirroring `SessionVerificationErrorCode`.
 */
export const SESSION_VERIFICATION_ERROR_CODES: readonly SessionVerificationErrorCode[] = [
  'invalid_token',
  'expired_token',
  'unknown_provider',
  'verification_failed',
] as const;

/**
 * Canonical readonly array mirroring `SessionValidationErrorCode`.
 */
export const SESSION_VALIDATION_ERROR_CODES: readonly SessionValidationErrorCode[] = [
  'missing_token',
  'invalid_token',
  'expired_token',
  'unknown_account',
  'session_verifier_not_configured',
  'lookup_failed',
] as const;

/**
 * Canonical readonly array mirroring `AccountLookupErrorCode`.
 */
export const ACCOUNT_LOOKUP_ERROR_CODES: readonly AccountLookupErrorCode[] = [
  'lookup_failed',
] as const;

/**
 * Verifier-produced session claim. The shape is locked under WP-112
 * §Locked contract values: `authProvider` reuses the WP-052
 * `AuthProvider` union verbatim; `authProviderSub` is the
 * verifier-produced subject identifier (OIDC `sub` semantics — a
 * stable per-user identifier within the broker's tenant);
 * `expiresAt` is an ISO-8601 UTC timestamp the orchestrator checks
 * with an inclusive `<= now()` comparison and no skew tolerance
 * (skew is the verifier's responsibility).
 *
 * The local field name `authProviderSub` is the OIDC nomenclature
 * used at the verifier boundary only. The translation from
 * `authProviderSub` to the canonical `authProviderId` field
 * (per `00.2-data-requirements.md`) happens at exactly one site —
 * the SQL parameter binding inside `findAccountByAuthProviderSub`.
 */
export interface VerifiedSessionClaim {
  readonly authProvider: AuthProvider;
  readonly authProviderSub: string;
  readonly expiresAt: string;
}

/**
 * Broker-agnostic verifier interface. Single method `verify(token)`
 * returns a `Result` carrying either a successfully verified claim
 * or a closed-union error code. WP-126 implements this against
 * Hanko's JWKS endpoint; future replacement brokers (per WP-099
 * D-9901's replacement-safety constraint) implement against
 * whatever signer is selected. The orchestrator imports zero broker
 * symbols — the only shared surface is this interface plus
 * `VerifiedSessionClaim` and `SessionVerificationErrorCode`.
 */
export interface SessionVerifier {
  verify(token: string): Promise<Result<VerifiedSessionClaim>>;
}

/**
 * Successful row payload returned by `findAccountByAuthProviderSub`
 * (per D-11203). The shape uses canonical wire-level field names —
 * `accountId` (not `playerExtId`), `authProvider` (not
 * `auth_provider`), `authProviderId` (not `authProviderSub`,
 * `authProviderRef`, or `auth_provider_id`). The
 * `authProviderSub` → `authProviderId` rename happens at the SQL
 * parameter binding inside the lookup helper; consumers see the
 * canonical name at the function boundary.
 */
export interface AccountLookupHit {
  readonly accountId: AccountId;
  readonly authProvider: AuthProvider;
  readonly authProviderId: string;
}

/**
 * Caller-injected resolver that turns a `VerifiedSessionClaim` into
 * an `AccountId`. The orchestrator calls this after the verifier
 * accepts the token and the `expiresAt` defense-in-depth check
 * passes. Production wiring composes the default resolver as a
 * thin pass-through over `findAccountByAuthProviderSub`; tests
 * inject fakes directly.
 *
 * The resolver returns `Result<AccountId | null>`. The `null`
 * payload is the resolver's no-match signal: a verifier-accepted
 * token whose `(authProvider, authProviderSub)` claim pair does
 * not yet correspond to any `legendary.players` row (a normal
 * first-Hanko-callback condition for a brand-new user). The
 * orchestrator translates `Result.ok(null)` into
 * `Result.fail({ code: 'unknown_account' })` at exactly one site
 * — the no-match branch in `requireAuthenticatedSession`. A
 * resolver-side `Result.fail({ code: 'lookup_failed' })` is
 * forwarded verbatim by the orchestrator.
 */
export type AccountResolver = (
  claim: VerifiedSessionClaim,
  database: DatabaseClient,
) => Promise<Result<AccountId | null>>;

/**
 * Required argument to `requireAuthenticatedSession`. Per D-11204
 * the unconfigured-default failure fires when `options.verifier` is
 * missing or `undefined` — `options` itself is mandatory at the
 * type level (the type system does not permit omitting it).
 *
 * `accountResolver` is similarly optional at the runtime check; in
 * practice, production wiring binds both via
 * `configureSessionValidation`. A bound closure with both seams
 * configured is the only path that reaches the verifier-call step.
 *
 * `database` is required: the orchestrator passes it through to
 * the resolver (which queries `legendary.players` via the lookup
 * helper). This mirrors the WP-101 / WP-102 / WP-104 caller-
 * injected `DatabaseClient` pattern; the orchestrator owns no
 * pool of its own.
 */
export interface RequireAuthenticatedSessionOptions {
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
  readonly database: DatabaseClient;
}

/**
 * Minimal request shape consumed by the orchestrator. The contract
 * is intentionally narrow: only `headers` is read, and within
 * `headers` only the `authorization` (or capitalized
 * `Authorization`) entry is consulted (per D-11202 — bearer header
 * only, no cookie path, no WebSocket carrier in WP-112). A
 * Node `IncomingMessage` satisfies this shape directly; future
 * cookie / Sec-WebSocket-Protocol carriers (WP-126 or a future
 * reconnect WP) supply their own thin adapter without modifying
 * any WP-112 file.
 */
export interface SessionTokenRequest {
  readonly headers: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
}

// why: re-export AccountId / AuthProvider / DatabaseClient / Result
// at this module boundary so downstream consumers (future
// request-handler WPs, the catalog row references, WP-126's adapter
// boundary) can resolve every auth symbol from a single module.
// The original declarations live in `../identity/identity.types.js`;
// re-exporting here is a convenience and explicitly NOT a
// redeclaration (WP-052 D-5201 contract preserved by construction).
export type {
  AccountId,
  AuthProvider,
  DatabaseClient,
  Result,
} from '../identity/identity.types.js';
