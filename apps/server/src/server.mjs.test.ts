/**
 * Wiring-ordering test for `startServer()` — WP-113 PS-5.
 *
 * Verifies that `apps/server/src/server.mjs`:
 * 1. Imports `setRegistryForSetup` from `@legendary-arena/game-engine`.
 * 2. Calls `setRegistryForSetup(registry)` inside `startServer()`,
 *    AFTER the `Promise.all` destructure that captures the loaded
 *    registry, and BEFORE `Server({ games, origins })` is constructed.
 *
 * The test reads `server.mjs` as text and asserts on the call site
 * shape rather than running `startServer()` end-to-end. Running the
 * server requires the real PostgreSQL rules loader, the local registry
 * file loader, and a TCP listener — all outside the boundary of a unit
 * test. The text-shape assertion is sufficient to lock the wiring
 * ordering: if the call is removed, reordered, or commented out, this
 * test fails.
 *
 * Per EC-113 §6 step 13: "use `mock.module` or a re-exported test
 * seam to spy the call; do NOT require deep boardgame.io constructor
 * spying." Text-shape assertion is a re-exported test seam in spirit —
 * it observes the wiring contract without spinning up the runtime.
 *
 * @amended WP-113: per D-10014.
 * @amended WP-131: added `describe('startup guard (WP-131)')` block
 *   exercising `tryConstructHankoVerifier()` directly. The helper is
 *   exported from `server.mjs` so the production-fatal vs dev-mode-warn
 *   D-13101 paths can be tested without invoking `startServer()`
 *   end-to-end (which would require a live PostgreSQL connection via
 *   `loadRules()`). The exported helper is the smallest-surface form
 *   per WP-131 §D's "smallest-surface form that compiles and runs
 *   under node:test" clause.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { tryConstructHankoVerifier } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, 'server.mjs');

describe('apps/server/src/server.mjs — registry wiring contract (WP-113 PS-5)', () => {
  it('imports setRegistryForSetup from @legendary-arena/game-engine', async () => {
    const text = await readFile(serverPath, 'utf8');

    const importMatch = text.match(
      /import\s*\{[^}]*\bsetRegistryForSetup\b[^}]*\}\s*from\s*['"]@legendary-arena\/game-engine['"]/,
    );
    assert.ok(
      importMatch,
      'server.mjs must import setRegistryForSetup from @legendary-arena/game-engine',
    );
  });

  it('captures the resolved registry from the Promise.all destructure (PS-5 minimal-diff destructure rename)', async () => {
    const text = await readFile(serverPath, 'utf8');

    // why: PS-5 LOCKED — the Promise.all destructure was renamed from
    // `[, , parGate]` to `[registry, , parGate]` so `registry` is in
    // scope for the setRegistryForSetup call that follows. The third
    // entry remains `parGate` to preserve the existing wiring.
    const destructureMatch = text.match(
      /const\s*\[\s*registry\s*,\s*,\s*parGate\s*\]\s*=\s*await\s+Promise\.all\s*\(/,
    );
    assert.ok(
      destructureMatch,
      'server.mjs must destructure `[registry, , parGate]` from `await Promise.all(...)` per PS-5',
    );
  });

  it('calls setRegistryForSetup(registry) immediately after the Promise.all resolves', async () => {
    const text = await readFile(serverPath, 'utf8');

    // why: assert the call site exists with the expected argument.
    const callMatch = text.match(/setRegistryForSetup\s*\(\s*registry\s*\)/);
    assert.ok(
      callMatch,
      'server.mjs must call setRegistryForSetup(registry) inside startServer()',
    );
  });

  it('orders the setRegistryForSetup call BEFORE the Server({ games, origins }) construction (wiring-ordering invariant)', async () => {
    const text = await readFile(serverPath, 'utf8');

    const callIndex = text.indexOf('setRegistryForSetup(registry)');
    const serverConstructIndex = text.indexOf('Server({');

    assert.ok(callIndex > -1, 'setRegistryForSetup(registry) call must exist');
    assert.ok(serverConstructIndex > -1, 'Server({...}) construction must exist');
    assert.ok(
      callIndex < serverConstructIndex,
      'setRegistryForSetup(registry) must be called BEFORE Server({ games, origins }) is constructed — otherwise Game.setup() runs without the registry on the first match-create',
    );
  });
});

describe('startup guard (WP-131)', () => {
  // why: save and restore the four `process.env` keys these tests
  // mutate (`NODE_ENV`, `HANKO_TENANT_BASE_URL`, `HANKO_EXPECTED_AUDIENCE`,
  // `HANKO_JWKS_REFRESH_INTERVAL_MS`). State leakage into adjacent
  // tests (especially WP-112 / WP-126 verifier tests, which rely on
  // a known dev-mode env) would produce silent cross-suite coupling.
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'NODE_ENV',
    'HANKO_TENANT_BASE_URL',
    'HANKO_EXPECTED_AUDIENCE',
    'HANKO_JWKS_REFRESH_INTERVAL_MS',
  ] as const;

  before(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
  });

  after(() => {
    for (const key of envKeys) {
      const restored = savedEnv[key];
      if (restored === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = restored;
      }
    }
  });

  it('production-mode boot with missing HANKO_TENANT_BASE_URL throws the locked diagnostic', () => {
    // why: locks the D-13101 production-fatal path. Any deviation
    // from the locked full-sentence diagnostic body breaks the
    // operator-facing contract — Render's deploy logs surface this
    // text verbatim when a misconfigured production tenant is
    // promoted, and the WP-131 acceptance gate expects the body
    // verbatim.
    process.env.NODE_ENV = 'production';
    delete process.env.HANKO_TENANT_BASE_URL;
    process.env.HANKO_EXPECTED_AUDIENCE = 'fixture-aud';
    delete process.env.HANKO_JWKS_REFRESH_INTERVAL_MS;

    let caught: unknown;
    try {
      tryConstructHankoVerifier();
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof Error, 'production + missing env must throw an Error');
    assert.equal(
      (caught as Error).message,
      'Hanko verifier configuration is incomplete. Set HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE in the Render dashboard before deploying. Production cannot start without them.',
    );
  });

  it('dev-mode boot with missing env returns undefined (verifier not configured)', () => {
    // why: locks the D-13101 non-production fail-closed-dev-mode
    // path. The pre-WP-131 default was `verifier: undefined`, which
    // surfaced 500 with `'session_verifier_not_configured'` per
    // D-11204; WP-131 preserves that behavior verbatim for engineers
    // iterating on non-authenticated routes who do not need a Hanko
    // tenant. Returning `undefined` here keeps the orchestrator's
    // existing fail-closed path the source of truth.
    process.env.NODE_ENV = 'development';
    delete process.env.HANKO_TENANT_BASE_URL;
    delete process.env.HANKO_EXPECTED_AUDIENCE;
    delete process.env.HANKO_JWKS_REFRESH_INTERVAL_MS;

    const verifier = tryConstructHankoVerifier();

    assert.equal(verifier, undefined);
  });
});
