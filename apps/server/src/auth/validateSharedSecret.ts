/**
 * Shared-Secret Validator — Server Layer (WP-231 / EC-263)
 *
 * The SINGLE constant-time shared-secret comparison used by every CI-facing
 * shared-secret endpoint on `apps/server`:
 *
 *   - `POST /api/sweep/runs`        (`X-Sweep-Token`,      WP-209, refactored
 *                                     to call this helper — behavior-preserving)
 *   - `GET  /api/sweep/runs/latest` (`X-Sweep-Token`,      WP-231 new sweep-read)
 *   - `POST /api/inspection/reports`(`X-Inspection-Token`, WP-231 new)
 *
 * Before WP-231 the sweep POST re-implemented this check inline. Centralizing
 * it here makes the third call site the abstraction trigger (per 00.6
 * "duplicate first, abstract on the third copy") and gives the whole agent
 * pipeline (Builder/Architect, WP-232) ONE shared-secret bug surface instead of
 * one per route.
 *
 * Layer-boundary contract: imports only `node:crypto`. No `boardgame.io`, no
 * `pg`, no other server module — this is a leaf helper.
 *
 * Authority: WP-231 §Non-Negotiable Constraints ("Shared-secret validation MUST
 * go through one helper"); EC-263 §Guardrails + §Required `// why:` Comments;
 * D-20702 (sweep auth posture — the length-pre-check + `timingSafeEqual`
 * pattern this generalizes); D-23103 (CI sweep-blob read endpoint reusing the
 * sweep token family).
 */

import { timingSafeEqual } from 'node:crypto';

/**
 * Returns `true` iff `headerValue` is a non-empty string that is byte-for-byte
 * equal to `envToken` in constant time. Returns `false` for every other input —
 * a missing / undefined / empty header, a length mismatch, or an equal-length
 * byte mismatch. NEVER throws (a thrown `RangeError` from `timingSafeEqual`
 * would surface as a 500 and leak a length signal to the caller).
 *
 * @param headerValue The raw request-header token (may be `null`/`undefined`).
 * @param envToken    The configured shared secret (loaded once at startup).
 */
export function validateSharedSecret(
  headerValue: string | null | undefined,
  envToken: string,
): boolean {
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return false;
  }
  // why: the `Buffer.byteLength` length pre-check MUST run before
  // `timingSafeEqual` because Node throws a `RangeError` on unequal-length
  // buffers; the pre-check preserves both the fail-fast 401 path AND the
  // constant-time guarantee on equal-length inputs. Centralizing it here gives
  // sweep + inspection (+ future agents) one shared-secret bug surface.
  if (Buffer.byteLength(headerValue) !== Buffer.byteLength(envToken)) {
    return false;
  }
  // why: constant-time comparison prevents a timing side channel from leaking
  // the shared secret; `===` would early-exit on the first differing byte.
  return timingSafeEqual(Buffer.from(headerValue), Buffer.from(envToken));
}
