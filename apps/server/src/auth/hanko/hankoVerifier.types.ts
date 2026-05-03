/**
 * Hanko Session Verifier — Types (WP-126)
 *
 * Hanko-specific contracts for the `SessionVerifier` implementation
 * consumed by the WP-112 orchestrator. This module owns the broker's
 * config shape (`HankoVerifierConfig`), the JWKS fetcher seam
 * (`JwksFetcher`), and the closed-set federated-IdP lookup table
 * (`HANKO_IDP_TO_AUTH_PROVIDER`). Every other broker-facing symbol
 * (the `SessionVerifier` interface, the `VerifiedSessionClaim`
 * payload shape, the `SessionVerificationErrorCode` closed union,
 * the single-parameter `Result<T>`, and the `AuthProvider` enum) is
 * re-imported from `../sessionToken.types.js` and re-exported here
 * verbatim — never redeclared.
 *
 * Module-path lock: `apps/server/src/auth/hanko/` per WP-099 D-9904.
 * Every `@teamhanko/*` import, `hanko.io` URL, and Hanko-specific
 * type lives only under this directory; the F-2 grep gate enforces
 * the boundary. See WP-099 §B Future-Auth Gate (F-1..F-7) for the
 * replacement-safety contract.
 *
 * Dependency-surface lock: D-12601 selects the built-ins-only path —
 * RS256 verification via Node v22 `node:crypto.createPublicKey` from
 * a JWK + `crypto.verify`. No top-level `jsonwebtoken` / `jose` /
 * `jwks-rsa` add. The `JwksFetcher` seam lets tests inject a fake
 * `(url) => Promise<Response>` without touching `globalThis.fetch`.
 *
 * Federated-IdP mapping lock: D-12604 selects the documented Hanko
 * `amr` (Authentication Method References) claim. Hanko's published
 * format is `ext:<provider>` for third-party logins (cite:
 * `https://docs.hanko.io/guides/session-management` plus Hanko
 * source `backend/flow_api/flow/shared/hook_determine_amr_values.go`
 * literal `amr = append(amr, "ext:"+thirdPartyProvider)`). The
 * mapping table below is closed-set; unknown values resolve to
 * `Result.fail({ code: 'unknown_provider' })` at exactly one site
 * inside the verifier closure.
 *
 * Authority: WP-126 §Scope (In) §A; WP-099 §B (F-1..F-7); D-9904
 * (module-path lock); D-12601..D-12604 (executor-time decision
 * locks); WP-112 `SessionVerifier` interface contract.
 */

import type {
  AuthProvider,
  Result,
  SessionVerificationErrorCode,
  SessionVerifier,
  VerifiedSessionClaim,
} from '../sessionToken.types.js';

/**
 * Caller-injected JWKS fetcher. Production wiring leaves this
 * `undefined` and the cache falls back to the Node v22 global
 * `fetch`. Tests inject a fake `(url) => Promise<Response>` so no
 * test ever touches `globalThis.fetch`, `MockAgent`, or `undici`.
 *
 * The returned `Response` is consumed by `await response.json()`
 * and is expected to follow the JWKS shape
 * `{ keys: JsonWebKey[] }` (RFC 7517).
 */
export type JwksFetcher = (url: string) => Promise<Response>;

/**
 * Per-instance verifier configuration. All fields are `readonly`;
 * a factory call binds the values for the lifetime of the returned
 * verifier closure. Two `createHankoSessionVerifier(config)` calls
 * produce two independent JWKS caches (per-instance state lock per
 * D-12603).
 *
 * `tenantBaseUrl` is the **tenant-scoped origin** per Hanko Cloud's
 * documented `/{tenant_id}/.well-known/jwks.json` endpoint shape
 * (e.g., `https://passkeys.hanko.io/<tenant_id>`). The verifier
 * appends `/.well-known/jwks.json` programmatically — the path is
 * never hand-coded.
 *
 * `expectedAudience` is matched against the JWT `aud` claim
 * verbatim (the verifier accepts both string and string[] `aud`
 * shapes per RFC 7519 §4.1.3 and Hanko's documented `aud: string[]`
 * sample).
 *
 * `jwksRefreshIntervalMs` is optional; `undefined` substitutes the
 * D-12603 default of 300_000 ms (5 minutes) at exactly one site
 * inside the verifier factory body. Downstream (the cache config)
 * always sees a concrete number.
 *
 * `fetcher` is optional; `undefined` falls back to the global
 * `fetch` at exactly one site inside the cache.
 */
export interface HankoVerifierConfig {
  readonly tenantBaseUrl: string;
  readonly expectedAudience: string;
  readonly jwksRefreshIntervalMs?: number;
  readonly fetcher?: JwksFetcher;
}

// why: closed-set object-literal lookup per D-9902 + F-1 — mapping
// output values are the WP-052 `AuthProvider` enum verbatim
// (`'email' | 'google' | 'discord'`). The broker-name value is
// deliberately absent (per F-1 the broker is invisible at rest); no
// fourth member; no `'oidc'`. The federated keys (`'ext:google'`,
// `'ext:discord'`) follow the broker's documented `amr` format; the
// native keys (`'pwd'`, `'passkey'`, `'otp'`, `'totp'`,
// `'security_key'`) are the documented native auth methods, all of
// which the project records as `authProvider: 'email'`. A federated
// `amr` element takes precedence over a native one in the verifier's
// two-pass scan; an unrecognized `amr` array resolves to
// `Result.fail({ code: 'unknown_provider' })`.
export const HANKO_IDP_TO_AUTH_PROVIDER: Readonly<Record<string, AuthProvider>> = {
  'ext:google': 'google',
  'ext:discord': 'discord',
  pwd: 'email',
  passkey: 'email',
  otp: 'email',
  totp: 'email',
  security_key: 'email',
} as const;

// why: re-export the WP-112 broker-agnostic surface so downstream
// consumers (the verifier factory, the verifier tests, future
// catalog references) can resolve every Hanko-adjacent symbol from
// this module. The original declarations live in
// `../sessionToken.types.ts`; re-exporting here is convenience and
// explicitly NOT redeclaration (WP-112 contract preserved).
export type {
  AuthProvider,
  Result,
  SessionVerificationErrorCode,
  SessionVerifier,
  VerifiedSessionClaim,
} from '../sessionToken.types.js';
