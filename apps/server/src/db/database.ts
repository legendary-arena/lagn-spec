/**
 * PostgreSQL Connection Pool — Server Layer (WP-115)
 *
 * Owns the long-lived `pg.Pool` lifecycle. Constructed exactly once
 * at server startup (from `apps/server/src/server.mjs`); closed
 * exactly once on `SIGTERM` (from `apps/server/src/index.mjs`, after
 * the HTTP server's graceful-shutdown step). Every request handler
 * that needs database access checks out a connection from this Pool
 * via `pool.query(...)` or `pool.connect()` — never constructs its
 * own.
 *
 * This module belongs to the server layer only. It is consumed by
 * `apps/server/src/leaderboards/leaderboard.routes.ts` (and, when
 * the WP-102 follow-up wires it, by `profile.routes.ts`). Game-engine
 * code, registry code, preplan code, and any UI / client package
 * must never import this file.
 *
 * Authority: WP-115 §Scope (In) §A; EC-119 §Locked Values (Pool
 * sizing); D-115NN (Pool location, sizing rationale, lifecycle
 * ownership). The rules loader at `apps/server/src/rules/loader.mjs`
 * uses its own short-lived Pool because it runs once at startup and
 * tears down before request traffic begins; this module is the
 * canonical Pool for request-time database access.
 */

import pg from 'pg';

const { Pool } = pg;

// why: a single long-lived Pool is the required pattern per
// `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §8 Backend`
// ("`pg` pool used for all database connections (not a single
// client)"); per-request `new Pool()` exhausts available
// connections and loses connection-checkout semantics, and
// per-request `new pg.Client()` defeats the pool's reuse
// guarantees entirely. Lifetime is the process lifetime;
// close-on-SIGTERM is owned by `apps/server/src/index.mjs`,
// never by a route handler.
/**
 * Constructs the long-lived `pg.Pool` instance. Reads connection
 * configuration from `process.env.DATABASE_URL` — the same env-var
 * contract the existing `apps/server/src/rules/loader.mjs` consumes,
 * so a single environment variable governs every database surface
 * in this process.
 *
 * Pool sizing values are locked at WP-115 v1.0 §Locked contract
 * values and must not be overridden via env vars in this packet;
 * production tuning is a future WP.
 */
export function createPool(): pg.Pool {
  // why: the locked sizing values (max=10, idle=30s, connect=5s)
  // are sized for a Render starter instance. `max=10` matches the
  // expected request concurrency for the public leaderboard
  // surface without exhausting the upstream PostgreSQL connection
  // limit; `idleTimeoutMillis=30000` releases idle clients
  // promptly so a brief traffic spike does not hold connections
  // unnecessarily; `connectionTimeoutMillis=5000` fails fast on
  // upstream outages so a hung handler does not silently consume
  // a checkout slot. Production tuning (e.g., reading max from
  // an env var) is a future hardening WP per WP-115 §Out of
  // Scope.
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

/**
 * Closes the supplied `pg.Pool`, draining in-flight clients before
 * resolving. Called from the SIGTERM handler in
 * `apps/server/src/index.mjs` after the HTTP server's graceful-
 * shutdown step resolves — never from a route handler. Thin wrapper
 * over `pool.end()` for symmetry with `createPool` and so the
 * SIGTERM call site reads as `closePool(pool)` rather than
 * `pool.end()` (testability + grep clarity).
 */
export async function closePool(pool: pg.Pool): Promise<void> {
  await pool.end();
}
