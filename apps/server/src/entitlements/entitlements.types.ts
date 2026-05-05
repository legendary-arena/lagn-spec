/**
 * Entitlements Types — Server Layer (WP-132)
 *
 * Durable contracts for the read half of the entitlements substrate.
 * These types form the wire shape consumed by the
 * `GET /api/me/entitlements` endpoint and the
 * `getEntitlementsForAccount` library function.
 *
 * The `EntitlementKey` closed union (D-13203) is locked to **cosmetic /
 * access / presentation values only**. NG-1 (no pay-to-win) protection
 * is structural via the Layer Boundary — `packages/game-engine/**` /
 * `packages/registry/**` / `packages/preplan/**` cannot import from
 * `apps/server/src/entitlements/`, so an entitlement key cannot
 * influence gameplay even by accident. The closed-set lock at the
 * type / SQL CHECK layer is defense-in-depth. Year-suffix discipline
 * (`_2026`) applies to time-boxed supporter SKUs only — renewal ships a
 * NEW key (e.g., `_2027`) rather than mutating the existing row;
 * cosmetic keys are evergreen and NOT year-suffixed.
 *
 * Adding an `EntitlementKey` member requires (a) a new WP, (b) a
 * `DECISIONS.md` entry, (c) a Vision §17 cosmetic-only confirmation,
 * (d) a byte-identical migration update to the SQL CHECK constraint
 * list on `legendary.entitlements.entitlement_key`, and (e) a
 * byte-identical update to `ENTITLEMENT_KEYS`. The compile-time
 * exhaustive switch in `entitlements.logic.test.ts` catches TS-side
 * drift; SQL CHECK ↔ canonical array parity is review-locked.
 *
 * This module belongs to the server layer only. It must not be
 * imported from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `packages/vue-sfc-loader/**`,
 * `apps/arena-client/**`, `apps/replay-producer/**`, or
 * `apps/registry-viewer/**`.
 *
 * `AccountId`, `DatabaseClient` are re-imported from
 * `../identity/identity.types.js` per the WP-052 D-5201 contract —
 * never redeclared.
 *
 * `EntitlementsResult<T>` is declared locally — `Result<T>` from
 * `../identity/identity.types.js` is keyed on `IdentityErrorCode`
 * which cannot carry the WP-132 `'lookup_failed'` code; this mirrors
 * the WP-102 `ProfileResult<T>` / WP-104 `OwnerProfileResult<T>`
 * declared-locally precedent verbatim.
 *
 * Authority: WP-132 §Scope (In) §A; EC-135 §1; D-13201 (module
 * path); D-13202 (migration slot 011); D-13203 (EntitlementKey
 * closed set); D-13204 (source closed set); WP-102 §Locked contract
 * values + WP-104 §Locked contract values (declared-locally
 * `*Result<T>` precedent).
 */

import type {
  AccountId,
  DatabaseClient,
} from '../identity/identity.types.js';

// why: re-exported so the route handler and tests can reference the
// identity-layer aliases through `./entitlements.types.js` without
// re-importing from `../identity/identity.types.js` directly,
// preserving the single import boundary documented above.
export type { AccountId, DatabaseClient };

/**
 * Closed union of cosmetic / access / presentation entitlement keys
 * recognized at WP-132 close. Six members:
 *
 *   - `'supporter_tier_basic_2026'` — time-boxed supporter SKU for
 *     the 2026 calendar year. Renewal ships a NEW key
 *     (`'supporter_tier_basic_2027'`) rather than mutating the row.
 *   - `'cosmetic_playmat_classic'` — evergreen playmat skin.
 *   - `'cosmetic_playmat_comic'` — evergreen playmat skin.
 *   - `'cosmetic_playmat_minimal'` — evergreen playmat skin.
 *   - `'cosmetic_cardback_default_plus'` — evergreen card-back skin.
 *   - `'cosmetic_avatar_frame_supporter'` — evergreen avatar frame.
 *
 * MUST stay byte-identical to the `ENTITLEMENT_KEYS` array literal
 * below AND to the SQL CHECK constraint list in
 * `data/migrations/011_create_entitlements.sql`. The compile-time
 * exhaustive switch in `entitlements.logic.test.ts` enforces the
 * TS-side parity; SQL CHECK parity is review-locked.
 */
export type EntitlementKey =
  | 'supporter_tier_basic_2026'
  | 'cosmetic_playmat_classic'
  | 'cosmetic_playmat_comic'
  | 'cosmetic_playmat_minimal'
  | 'cosmetic_cardback_default_plus'
  | 'cosmetic_avatar_frame_supporter';

/**
 * Canonical readonly array mirroring the `EntitlementKey` union.
 * Adding a value requires updating both the union, this array, AND
 * the SQL CHECK constraint list in
 * `data/migrations/011_create_entitlements.sql` in the same change
 * (see `.claude/rules/code-style.md §Drift Detection`).
 */
export const ENTITLEMENT_KEYS: readonly EntitlementKey[] = [
  'supporter_tier_basic_2026',
  'cosmetic_playmat_classic',
  'cosmetic_playmat_comic',
  'cosmetic_playmat_minimal',
  'cosmetic_cardback_default_plus',
  'cosmetic_avatar_frame_supporter',
] as const;

/**
 * Closed union of grant-source values per D-13204. Three members:
 *
 *   - `'stripe'` — webhook-driven grant (WP-134 owns the writer).
 *     `source_ref` MUST carry the Stripe Checkout Session ID
 *     (`cs_*`) or Payment Intent ID (`pi_*`).
 *   - `'admin_grant'` — future admin-tool grant. `source_ref` MAY
 *     carry an admin audit ref.
 *   - `'comp'` — database-direct intervention with a `D-NNNNN`
 *     `DECISIONS.md` citation in `source_ref`. Operationally
 *     distinct from `'admin_grant'` so forensic queries can
 *     separate routine ops from one-off interventions.
 *
 * The per-source `source_ref` semantics are review-locked rather
 * than CHECK-encoded — WP-132 ships ZERO writer for any of the
 * three values. See the comment block above the `source_ref` column
 * in `data/migrations/011_create_entitlements.sql` for the rationale.
 */
export type EntitlementSource = 'stripe' | 'admin_grant' | 'comp';

/**
 * Canonical readonly array mirroring the `EntitlementSource` union.
 */
export const ENTITLEMENT_SOURCES: readonly EntitlementSource[] = [
  'stripe',
  'admin_grant',
  'comp',
] as const;

/**
 * Wire shape of a single active entitlement. Returned by
 * `getEntitlementsForAccount` and serialized verbatim as one
 * element of the `entitlements` array on `GET /api/me/entitlements`.
 *
 * Field-name mapping to `legendary.entitlements`:
 *   - `entitlementKey` ← `entitlement_key`
 *   - `source`         ← `source`
 *   - `sourceRef`      ← `source_ref` (NULL → `null`)
 *   - `grantedAt`      ← `granted_at` (ISO-8601 UTC string)
 *   - `revokedAt`      ← `revoked_at` (always `null` on the read
 *     path; the SELECT carries `WHERE revoked_at IS NULL`, so
 *     revoked rows are excluded from the response by contract)
 *
 * The `id` and `player_id` columns are server-internal and never
 * surface on the wire form.
 */
export interface Entitlement {
  readonly entitlementKey: EntitlementKey;
  readonly source: EntitlementSource;
  readonly sourceRef: string | null;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
}

/**
 * Programmatic error codes for fallible entitlements-helper
 * operations. Closed union: callers dispatch on `code` without
 * parsing prose `reason` strings.
 *
 * `'lookup_failed'` is emitted on (a) Step 1 zero-row when the
 * supplied `accountId` resolves to no `legendary.players` row (a
 * race against account deletion the orchestrator cannot prevent),
 * (b) a thrown error from the Step 1 `legendary.players` query, or
 * (c) a thrown error from the Step 2 `legendary.entitlements`
 * query. The route layer translates this code to a 500 with the
 * operational fault envelope `{ error: 'internal_error' }` per
 * D-11802 = (C).
 *
 * Adding a code requires updating both this union and
 * `ENTITLEMENT_ERROR_CODES` in the same change.
 */
export type EntitlementErrorCode = 'lookup_failed';

/**
 * Canonical readonly array mirroring the `EntitlementErrorCode`
 * union.
 */
export const ENTITLEMENT_ERROR_CODES: readonly EntitlementErrorCode[] = [
  'lookup_failed',
] as const;

// why: declared locally rather than re-imported from
// `../identity/identity.types.js`. WP-052's `Result<T>` is keyed on
// `IdentityErrorCode` (a four-value union covering account-creation
// failures: `'duplicate_email' | 'invalid_email' |
// 'invalid_display_name' | 'unknown_account'`) and cannot carry
// the WP-132 `'lookup_failed'` code. The shape mirrors WP-052's
// `Result<T>` exactly — same `ok` discriminant, same `value` /
// `reason` / `code` fields — but with the entitlements error union
// per the WP-102 PS-5 / WP-104 declared-locally precedent.
// `AccountId` and `DatabaseClient` are still re-imported above (no
// parallel declarations) so the identity contract remains the
// single source of truth for those two aliases.
/**
 * Discriminated-union result type for fallible entitlements-helper
 * operations. The `ok: true` branch carries the success value; the
 * `ok: false` branch carries a full-sentence `reason` string (per
 * code-style Rule 11) and a programmatic `code` for caller-side
 * dispatch without prose parsing.
 */
export type EntitlementsResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; code: EntitlementErrorCode };
