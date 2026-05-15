/**
 * Admin Gate — Server Layer (WP-110)
 *
 * Minimal shared-secret admin authentication. A single function that
 * validates the `X-Admin-Secret` request header against the
 * `ADMIN_SECRET` environment variable using a timing-safe comparison.
 *
 * Isolated in a single file so a future RBAC WP can swap the
 * implementation without touching route files.
 *
 * Authority: WP-110 §A; EC-163 §Locked Values; D-11001.
 */

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Validate that the request carries a valid `X-Admin-Secret` header
 * matching the server's `ADMIN_SECRET` env var.
 */
export function requireAdminSecret(
  request: IncomingMessage,
): { ok: true } | { ok: false; code: 'unauthorized' } {
  const configuredSecret = process.env.ADMIN_SECRET;

  // why: fail-closed — if ADMIN_SECRET is not configured in the
  // environment, every admin request is rejected. This prevents
  // accidental exposure when the env var is missing (e.g., a fresh
  // deploy without the secret set).
  if (
    configuredSecret === undefined ||
    configuredSecret === null ||
    configuredSecret.length === 0
  ) {
    return { ok: false, code: 'unauthorized' };
  }

  const headerValue = request.headers['x-admin-secret'];
  const providedSecret =
    typeof headerValue === 'string'
      ? headerValue
      : Array.isArray(headerValue)
        ? headerValue[0]
        : undefined;

  if (
    providedSecret === undefined ||
    providedSecret === null ||
    providedSecret.length === 0
  ) {
    return { ok: false, code: 'unauthorized' };
  }

  // why: timingSafeEqual prevents timing attacks where an attacker
  // could infer the secret character-by-character from response time
  // differences. Both buffers must be the same length for
  // timingSafeEqual; a length mismatch is an immediate reject (but
  // we still do a constant-time comparison on the length check itself
  // by converting to buffers and comparing lengths after encoding).
  const expectedBuffer = Buffer.from(configuredSecret, 'utf8');
  const providedBuffer = Buffer.from(providedSecret, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return { ok: false, code: 'unauthorized' };
  }

  const isValid = timingSafeEqual(expectedBuffer, providedBuffer);
  if (!isValid) {
    return { ok: false, code: 'unauthorized' };
  }

  return { ok: true };
}
