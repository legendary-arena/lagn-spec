/**
 * Avatar Upload Types — Server Layer (WP-106)
 *
 * Types and error codes for the avatar upload pipeline. The endpoint
 * contract is locked under D-10602; the validation policy under
 * D-10601. Field names and error codes are canonical — adding or
 * removing codes requires updating both the union and the canonical
 * array in the same change.
 *
 * Authority: WP-106 §Non-Negotiable Constraints; D-10601; D-10602;
 * D-11802 (error contract shape).
 */

import type { AccountId, DatabaseClient } from '../identity/identity.types.js';
import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';

export type { AccountId, DatabaseClient, SessionTokenRequest };

/**
 * Programmatic error codes for the avatar upload endpoint. Closed
 * union per D-10602. Adding a code requires updating both this union
 * and `AVATAR_UPLOAD_ERROR_CODES`.
 */
export type AvatarUploadErrorCode =
  | 'invalid_mime_type'
  | 'file_too_large'
  | 'rate_limited'
  | 'upload_failed'
  | 'unauthorized';

/**
 * Canonical readonly array mirroring `AvatarUploadErrorCode`.
 */
export const AVATAR_UPLOAD_ERROR_CODES: readonly AvatarUploadErrorCode[] = [
  'invalid_mime_type',
  'file_too_large',
  'rate_limited',
  'upload_failed',
  'unauthorized',
] as const;

/**
 * Success result from a completed avatar upload. The `avatarUrl` is
 * the full CDN URL that was written to `legendary.player_profiles`.
 */
export interface AvatarUploadResult {
  readonly avatarUrl: string;
}

/**
 * Discriminated-union result type for the avatar upload pipeline.
 */
export type AvatarUploadResponse =
  | { ok: true; value: AvatarUploadResult }
  | { ok: false; code: AvatarUploadErrorCode; message: string };

/**
 * Minimal R2 client interface for the avatar upload pipeline.
 * Mirrors the `LegendsR2Client` structural pattern from WP-142.
 * Caller-injected for testability.
 */
export interface AvatarR2Client {
  putObject(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl: string;
  }): Promise<void>;
  deleteObject(params: {
    bucket: string;
    key: string;
  }): Promise<void>;
}

/**
 * Caller-injected dependency bundle for `registerAvatarUploadRoutes`.
 */
export interface AvatarUploadRouteDependencies {
  readonly requireAuthenticatedSession: (
    req: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<
    | { ok: true; value: AccountId }
    | { ok: false; reason: string; code: string }
  >;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
  readonly r2Client: AvatarR2Client;
  readonly r2BucketName: string;
}
