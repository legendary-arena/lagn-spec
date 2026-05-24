/**
 * Admin Profile Types — Server Layer (WP-107)
 *
 * Durable contracts for the admin-only profile integrity surface.
 * These types form the wire shape consumed by the three new endpoints
 * under `/api/admin/players/:handle/` and the admin-only logic helpers
 * that compose the integrity view + emit audit-log rows. Field shapes,
 * names, and order are locked under WP-107 §Locked contract values +
 * EC-195 §Locked Values; drift here is a contract violation.
 *
 * This module belongs to the server layer only. It must not be imported
 * from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `packages/vue-sfc-loader/**`,
 * `apps/arena-client/**`, `apps/replay-producer/**`, or
 * `apps/registry-viewer/**`. The future admin-console client (if any)
 * consumes the same field shapes via a structurally compatible inline
 * interface, mirroring the WP-104 / WP-102 client-side
 * structural-mirror precedent.
 *
 * `AccountId`, `DatabaseClient` are re-imported from
 * `../../identity/identity.types.js` per the WP-052 D-5201 contract —
 * never redeclared.
 *
 * Authority: WP-107 §Locked contract values; EC-195 §Locked Values;
 * D-10701 (account-level scope); D-10702 (audit log append-only
 * single-table); D-10703 (handle in URL, not accountId).
 */

import type {
  AccountId,
  DatabaseClient,
} from '../../identity/identity.types.js';

// why: re-exported so other admin-namespace modules (logic / routes /
// tests) can reference the identity-layer aliases through this single
// module without re-importing across paths, mirroring the WP-104
// `ownerProfile.types.ts` re-export precedent.
export type { AccountId, DatabaseClient };

/**
 * Closed union of admin actions captured in the audit log. Mirrors the
 * DB-level `CHECK (action_type IN ('suspend', 'unsuspend'))` constraint
 * in migration 015 verbatim. Adding a value requires updating BOTH this
 * union and the DB CHECK constraint in lockstep (the drift-detection
 * test in `adminProfile.logic.test.ts` asserts forward and backward
 * inclusion against the SQL constraint where a test database is
 * available; the constant array below pairs with the union for
 * `00.6-code-style.md §Drift Detection` compliance).
 */
export type AdminPlayerActionType = 'suspend' | 'unsuspend';

/**
 * Canonical readonly array mirroring `AdminPlayerActionType`. Adding a
 * value requires updating both the union and this array in the same
 * change (see code-style §Drift Detection). The drift-detection test
 * asserts bidirectional Set equality.
 */
export const ADMIN_PLAYER_ACTION_TYPES: readonly AdminPlayerActionType[] = [
  'suspend',
  'unsuspend',
] as const;

/**
 * Closed union of programmatic error codes for fallible admin-profile
 * operations. Callers dispatch on `code` without parsing prose `reason`
 * strings. Locked under WP-107 §Locked contract values:
 *
 *   - `'unauthorized'` — `requireAdminSession` returned `'unauthorized'`
 *     (HTTP 401)
 *   - `'forbidden'` — `requireAdminSession` returned `'forbidden'`
 *     (HTTP 403)
 *   - `'not_found'` — handle resolution returned `null`
 *     (HTTP 404)
 *   - `'invalid_request'` — input validation failed (empty reason,
 *     over-cap reason, self-action, malformed body)
 *     (HTTP 400)
 *   - `'internal_error'` — DB fault / transaction failure
 *     (HTTP 500)
 *
 * Adding a code requires updating both this union and
 * `ADMIN_PROFILE_ERROR_CODES` in the same change; the drift-detection
 * test asserts forward and backward inclusion.
 */
export type AdminProfileErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'internal_error';

/**
 * Canonical readonly array mirroring `AdminProfileErrorCode`.
 */
export const ADMIN_PROFILE_ERROR_CODES: readonly AdminProfileErrorCode[] = [
  'unauthorized',
  'forbidden',
  'not_found',
  'invalid_request',
  'internal_error',
] as const;

/**
 * One row from the `legendary.admin_actions` audit log, projected to
 * the wire shape returned inside `AdminProfileResponse.recentAuditLog`.
 * `actionId` is serialized as `string` at the JSON boundary because
 * `bigserial` exceeds JavaScript's safe integer range in principle (and
 * because `pg` returns bigint columns as strings by default); the
 * `string` shape is the public contract regardless of the underlying
 * driver coercion.
 *
 * `createdAt` is the ISO-8601 UTC timestamp serialized from the
 * `timestamptz` column. `actingAccountId` is the AccountId of the admin
 * who performed the action (sourced from `requireAdminSession`'s
 * success branch at the mutation site).
 */
export interface AuditLogEntry {
  readonly actionId: string;
  readonly actingAccountId: AccountId;
  readonly actionType: AdminPlayerActionType;
  readonly reason: string;
  readonly createdAt: string;
}

/**
 * Response body shape for `GET /api/admin/players/:handle/integrity`.
 * Exactly 4 fields per WP-107 §Locked contract values:
 *
 *   `accountId` — text; matches legendary.players.ext_id
 *   `handle` — canonical handle
 *   `isSuspended` — boolean
 *   `recentAuditLog` — capped at LIMIT 100, ORDER BY created_at DESC,
 *     action_id DESC
 *
 * The 4-field surface is **admin-only by design**. Public / owner
 * profile composition (display name, badges, replays, team
 * affiliations) is reached by admins via the existing WP-102 /
 * WP-104 endpoints; composing those into this response would expand
 * scope into the WP-104 surface area and is explicitly out of scope
 * here. `Object.keys(response).sort()` MUST equal
 * `['accountId', 'handle', 'isSuspended', 'recentAuditLog']` — the
 * drift-detection test asserts this.
 */
export interface AdminProfileResponse {
  readonly accountId: AccountId;
  readonly handle: string;
  readonly isSuspended: boolean;
  readonly recentAuditLog: AuditLogEntry[];
}

/**
 * Request body shape for `POST /api/admin/players/:handle/suspend` and
 * `POST /api/admin/players/:handle/unsuspend`. Exactly one field
 * (`reason`); trimmed length 1-500 chars after `.trim()`-normalization.
 * Whitespace-only reasons are rejected at the application boundary
 * (the DB `CHECK (length(reason) BETWEEN 1 AND 500)` is
 * defense-in-depth).
 */
export interface AdminActionRequest {
  readonly reason: string;
}

/**
 * Response body shape for the two mutation endpoints
 * (`POST .../suspend` and `POST .../unsuspend`). Two fields
 * (`ok: true` literal + `actionId` string referencing the newly written
 * audit-log row). The `actionId` is the `bigserial` primary key of the
 * `legendary.admin_actions` row, serialized as a string at the JSON
 * boundary (mirrors `AuditLogEntry.actionId`).
 */
export interface AdminActionResponse {
  readonly ok: true;
  readonly actionId: string;
}

// why: declared locally rather than re-imported from
// `../../identity/identity.types.js`. WP-052's `Result<T>` is keyed on
// `IdentityErrorCode` (a four-value union covering account-creation
// failures) and cannot carry the WP-107 codes. The shape mirrors WP-052
// exactly — same `ok` discriminant, same `value` / `reason` / `code`
// fields — but with the admin-profile error union per the WP-104
// `OwnerProfileResult` precedent.
/**
 * Discriminated-union result type for fallible admin-profile
 * operations. The `ok: true` branch carries the success value; the
 * `ok: false` branch carries a full-sentence `reason` string (per
 * code-style Rule 11) and a programmatic `code` for caller-side
 * dispatch without prose parsing.
 */
export type AdminProfileResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; code: AdminProfileErrorCode };

/**
 * Successful payload returned by `suspendPlayer` /
 * `unsuspendPlayer`. The `actionId` is the freshly written audit-row
 * primary key, serialized as a string at the JSON boundary so wire
 * shape matches `AuditLogEntry.actionId` exactly. Route handlers map
 * this directly into `AdminActionResponse`.
 */
export interface MutationSuccess {
  readonly actionId: string;
}
