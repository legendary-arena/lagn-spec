/**
 * User-ID Hash Helper — Server Layer (WP-205 / EC-233)
 *
 * Two exported functions backing the D-20502 PII posture:
 *
 *   1. `hashUserId(rawUserId, salt)` — SHA-256 hex digest of
 *      `${rawUserId}|${salt}` for non-null `rawUserId`; null
 *      passthrough for anonymous events. The route boundary calls
 *      this BEFORE any INSERT so the raw `user_id` never reaches
 *      `legendary.analytics_events` in cleartext (D-20502 invariant
 *      verified by the integration test in `analytics.logic.test.ts`).
 *
 *   2. `getAnalyticsUserIdSalt()` — reads `ANALYTICS_USER_ID_SALT`
 *      from the environment. Production (`NODE_ENV === 'production'`)
 *      throws a full-sentence error if the env var is unset or empty
 *      — server startup fails loudly. Test/dev returns a fixed test
 *      salt and emits exactly one `console.warn` per process (one-shot
 *      module-level guard). The test salt + warning message are
 *      EC-233 §Locked Values; do NOT paraphrase.
 *
 * Layer-boundary contract: this module imports only `node:crypto`. No
 * `boardgame.io`, no `@legendary-arena/(game-engine|registry|preplan)`,
 * no `pg`, no `apps/dashboard/**`. SHA-256 only — SHA-1 and MD5 have
 * practical collisions and are forbidden by D-20502.
 *
 * Authority: WP-205 §Non-Negotiable Constraints → hashed-user_id
 * invariant + production salt-missing loud-fail + locked hash
 * invariant; EC-233 §Locked Values (test salt literal + one-shot
 * warning message + one-shot guard mechanism); D-20502 (PII posture);
 * D-20502 tightening (leakage gate at log + error boundary —
 * enforced at the route layer, not here).
 */

import { createHash } from 'node:crypto';

// why: D-20502 — the exact test salt literal used in non-production
// environments. Locked by EC-233 §Locked Values; the value is the
// ONLY string literal in source code that carries salt material AND
// is gated by `NODE_ENV !== 'production'`. A test or dev session that
// accidentally hashes against this salt and ships output to a
// production-facing surface is a separate problem; the warning
// (`ONE_SHOT_WARNING_MESSAGE` below) calls attention to the
// fallback so a developer doesn't accidentally rely on it.
const TEST_FALLBACK_SALT = 'test-salt-do-not-use-in-prod';

// why: D-20502 — locked warning message emitted exactly once per
// process via `console.warn` when the env var is unset in test/dev.
// EC-233 §Locked Values pins the exact content. The drift test in
// `userIdHash.test.ts` asserts byte-equality so a future edit that
// paraphrases the wording fails loudly.
const ONE_SHOT_WARNING_MESSAGE =
  '[analytics] ANALYTICS_USER_ID_SALT not set; using test-mode fallback salt. NOT FOR PRODUCTION.';

// why: D-20502 — module-level boolean flipped on first warning emit;
// subsequent calls skip the warning. The guard is process-lifetime
// (a fresh process re-warns once). The drift test asserts the second
// call emits zero warnings.
let hasWarnedAboutSalt = false;

/**
 * Computes the SHA-256 hex digest of `${rawUserId}|${salt}` for a
 * non-null `rawUserId`. Returns `null` for the anonymous-event
 * passthrough (`rawUserId === null`). Output is 64 lowercase hex
 * characters; the DB CHECK constraint
 * `analytics_events_user_id_hash_format` enforces the same shape as
 * defense-in-depth (a regression that skips hashing and binds raw
 * `user_id` to the column would fail the CHECK).
 *
 * Per-event-type carve-outs are FORBIDDEN per D-20502 — every event's
 * `user_id` passes through this function at the route boundary
 * uniformly; anonymous events naturally short-circuit via the null
 * input → null output branch. SHA-1 and MD5 are FORBIDDEN — both
 * have practical collisions.
 *
 * Deterministic by construction (SHA-256 is a pure function); the
 * drift test asserts two consecutive calls with the same arguments
 * produce byte-identical output.
 */
export function hashUserId(
  rawUserId: string | null,
  salt: string,
): string | null {
  if (rawUserId === null) {
    return null;
  }
  return createHash('sha256').update(`${rawUserId}|${salt}`).digest('hex');
}

/**
 * Loads the analytics user-id salt from the environment.
 *
 * - Production (`NODE_ENV === 'production'`): throws a full-sentence
 *   error if `process.env.ANALYTICS_USER_ID_SALT` is unset OR is the
 *   empty string. Server startup fails loudly — the same posture as
 *   `loadBillingConfig`'s production-fatal gate (D-13101 precedent).
 *
 * - Test / dev: returns the fixed test salt
 *   `'test-salt-do-not-use-in-prod'` AND emits exactly one
 *   `console.warn` per process. The one-shot guard via module-level
 *   `hasWarnedAboutSalt` ensures subsequent calls do not re-warn.
 *
 * The throw text is operator-facing and includes remediation:
 * `'ANALYTICS_USER_ID_SALT is unset; refusing to start. Set the env
 * var to a high-entropy secret string in the deployment environment.'`
 */
export function getAnalyticsUserIdSalt(): string {
  const rawValue = process.env.ANALYTICS_USER_ID_SALT;
  const isPresent = typeof rawValue === 'string' && rawValue.length > 0;
  // why: D-20502 — production loud-fail posture matches the
  // `loadBillingConfig` + Hanko verifier construction site
  // (`tryConstructHankoVerifier` in `apps/server/src/server.mjs`).
  // A misconfigured production deploy refuses to serve rather than
  // silently degrading to a known-weak salt (which would defeat the
  // entire PII posture for every persisted row).
  if (process.env.NODE_ENV === 'production' && isPresent === false) {
    throw new Error(
      'ANALYTICS_USER_ID_SALT is unset; refusing to start. Set the env var to a high-entropy secret string in the deployment environment.',
    );
  }
  if (isPresent === true) {
    return rawValue;
  }
  // why: D-20502 — non-production fallback. Emit the locked warning
  // exactly once per process (the module-level guard flips on first
  // emit). The fixed test salt lets `pnpm test` run without env-var
  // ceremony; the warning calls attention to the fallback so a
  // developer doesn't accidentally ship a build that depends on it.
  if (hasWarnedAboutSalt === false) {
    hasWarnedAboutSalt = true;
    console.warn(ONE_SHOT_WARNING_MESSAGE);
  }
  return TEST_FALLBACK_SALT;
}

// why: test helper exposed so `userIdHash.test.ts` can reset the
// one-shot guard between test cases. Not part of the runtime
// contract — production / dev wiring never calls this. Exporting via
// a named function with a self-documenting name (rather than a
// loose `let` mutation) keeps the test-only surface visible at grep
// time. Per EC-233 §Locked Values the one-shot guard is process-
// lifetime; this helper only matters inside the test process so
// independent test cases can re-exercise the warn-once branch.
export function __resetSaltWarningGuardForTests(): void {
  hasWarnedAboutSalt = false;
}

// why: test helper exposed so `userIdHash.test.ts` can assert the
// exact locked warning message (EC-233 §Locked Values) without
// duplicating the string literal in the test file. The drift test
// asserts that the test's expected message equals
// ONE_SHOT_WARNING_MESSAGE byte-identical.
export function __getOneShotWarningMessageForTests(): string {
  return ONE_SHOT_WARNING_MESSAGE;
}

// why: test helper exposed so `userIdHash.test.ts` can verify the
// fixed test salt is the EC-233 §Locked Values literal.
export function __getTestFallbackSaltForTests(): string {
  return TEST_FALLBACK_SALT;
}
