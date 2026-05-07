/**
 * Legendary Arena — Stripe Event Recovery Script (WP-134 / EC-140)
 *
 * Out-of-process cron worker that drains the unprocessed
 * `legendary.stripe_events` backlog. Invoked via:
 *
 *   node --env-file=.env scripts/process-stripe-events.mjs
 *
 * Reads every row matching `WHERE processed_at IS NULL ORDER BY
 * received_at ASC LIMIT 100`, dispatches each to `processStripeEvent`,
 * and prints `processed: <N>, skipped: <M>, errors: <K>` to stdout.
 *
 * Two-phase lifecycle (D-13405):
 *
 *   - Startup phase (exit 2 on fault): construct billingConfig +
 *     pg.Pool. Missing env vars or initial DB connection failure
 *     exits non-zero so cron pages on operator-actionable faults.
 *   - Scan loop (exit 0 even on per-row faults): per-row failures
 *     are logged to stderr (full-sentence message + event_id +
 *     error code) but the loop continues. Cron stays quiet on
 *     transient DB hiccups; the recorded-event ledger surfaces
 *     persistent faults via repeat appearance in subsequent runs.
 *
 * Pool teardown via `try { ... } finally { await pool.end(); }`
 * envelope (RS-1 lock).
 *
 * Authority: WP-134 §Scope (In) §D; EC-140 §1 + §2 + §3 (recovery
 * script lifecycle, output contract, ESM constraint, Stripe SDK
 * confinement); D-13405 (manual + Render Cron @ 15min cadence,
 * exit-code domain {0, 1, 2}, two-phase lifecycle).
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDirectory, '..');
const serverPackageJsonPath = join(projectRoot, 'apps', 'server', 'package.json');

// why: the recovery script imports `loadBillingConfig` from the
// server's TypeScript billing module per D-13405. tsx is registered
// programmatically (rather than via a `node --import tsx ...`
// invocation) so the spec'd `node --env-file=.env scripts/...mjs`
// command works as written. tsx is resolved from apps/server's
// devDependencies via a workspace-scoped require — keeps the
// recovery script's resolver pointing at the same tsx instance the
// server itself uses for tests and start-up.
const workspaceRequire = createRequire(serverPackageJsonPath);
const tsxApiPath = workspaceRequire.resolve('tsx/esm/api');
const { register } = await import(pathToFileURL(tsxApiPath).href);
register();

// why: Stripe SDK confinement (EC-136 §5 grep gate, inherited).
// `loadBillingConfig` is the Stripe-aware constructor; the recovery
// script reaches the Stripe boundary only through this import, never
// via a direct provider-SDK import. Same reasoning applies to
// `processStripeEvent` — fulfillment logic is server-layer code.
const billingConfigUrl = pathToFileURL(
  join(projectRoot, 'apps', 'server', 'src', 'billing', 'billing.config.ts'),
).href;
const processStripeEventUrl = pathToFileURL(
  join(projectRoot, 'apps', 'server', 'src', 'billing', 'processStripeEvent.logic.ts'),
).href;
const { loadBillingConfig } = await import(billingConfigUrl);
const { processStripeEvent } = await import(processStripeEventUrl);

const pgModule = workspaceRequire('pg');
const Pool = pgModule.default?.Pool || pgModule.Pool;

// why: D-13405 startup-fatal posture — missing env vars exit code 2
// so cron pages the operator. `loadBillingConfig` throws in
// production mode on missing env vars (per WP-133 EC-136 close).
// In non-production it returns undefined, which we treat the same
// way for the recovery-script context (no point running the loop
// without a valid Stripe config).
let billingConfig;
try {
  billingConfig = loadBillingConfig(process.env);
} catch (loadError) {
  const message = loadError instanceof Error ? loadError.message : String(loadError);
  process.stderr.write(
    `[process-stripe-events] startup failure — billing configuration could not be loaded: ${message}\n`,
  );
  process.exit(2);
}
if (billingConfig === undefined) {
  process.stderr.write(
    '[process-stripe-events] startup failure — loadBillingConfig returned undefined; set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ALLOWLIST, and PUBLIC_BASE_URL in .env or the Render dashboard before invoking this script.\n',
  );
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
  process.stderr.write(
    '[process-stripe-events] startup failure — DATABASE_URL is not set; set it in .env or as an environment variable before invoking this script.\n',
  );
  process.exit(2);
}

const pool = new Pool({ connectionString: databaseUrl });

let processedCount = 0;
let skippedCount = 0;
let errorCount = 0;

// why: D-13405 scan-loop pool teardown (RS-1) — short-lived per-cron
// pool wrapped in try/finally so connections release cleanly on every
// exit path (success, exception, scan-loop error). Mirrors the WP-126
// short-lived rules-loader pool precedent.
try {
  // why: LIMIT 100 batch size locked at WP §Locked contract values.
  // Per-row processing time is ≤200ms in the typical case (one
  // SELECT + one INSERT + two UPDATEs); 100 rows cap a cron cycle
  // at ≤20s, well under a 15-minute cadence so concurrent runs
  // cannot reasonably overlap at MVP scale. Future scaling WP can
  // harden the SELECT with `FOR UPDATE SKIP LOCKED` per the
  // future-scaling note logged under D-13405's run-overlap rationale.
  const unprocessedQuery = await pool.query(
    'SELECT id, event_id, event_type, payload, received_at, processed_at, process_error FROM legendary.stripe_events WHERE processed_at IS NULL ORDER BY received_at ASC LIMIT 100',
  );

  for (const row of unprocessedQuery.rows) {
    const rawId = row.id;
    const eventRowId = typeof rawId === 'bigint' ? rawId : BigInt(rawId);
    const eventRecord = {
      id: eventRowId,
      eventId: row.event_id,
      eventType: row.event_type,
      payload: row.payload,
      receivedAt:
        row.received_at instanceof Date
          ? row.received_at.toISOString()
          : String(row.received_at),
      processedAt:
        row.processed_at === null || row.processed_at === undefined
          ? null
          : row.processed_at instanceof Date
            ? row.processed_at.toISOString()
            : String(row.processed_at),
      processError: row.process_error ?? null,
    };

    let result;
    try {
      result = await processStripeEvent({
        eventRecord,
        billingConfig,
        database: pool,
      });
    } catch (perRowError) {
      // why: D-13405 scan-loop-tolerant posture — per-row exceptions
      // (which `processStripeEvent` should never produce, but
      // defense-in-depth) are logged to stderr and counted as
      // errors; the loop continues so a single bad row does not
      // poison the entire cron cycle.
      const message =
        perRowError instanceof Error ? perRowError.message : String(perRowError);
      process.stderr.write(
        `[process-stripe-events] event_id=${row.event_id} unexpected exception: ${message}\n`,
      );
      errorCount += 1;
      continue;
    }

    if (result.ok === true) {
      // why: 'already_processed' indicates a NULL→non-NULL race
      // between the SELECT and dispatch — the row was processed by
      // another path between fetch and dispatch. Counted separately
      // from `processedCount` so operators can distinguish
      // genuine fulfillment from race-fix no-ops.
      if (result.value.reason === 'already_processed') {
        skippedCount += 1;
      } else {
        processedCount += 1;
      }
    } else {
      process.stderr.write(
        `[process-stripe-events] event_id=${row.event_id} code=${result.code}: ${result.reason}\n`,
      );
      errorCount += 1;
    }
  }

  process.stdout.write(
    `processed: ${processedCount}, skipped: ${skippedCount}, errors: ${errorCount}\n`,
  );
} finally {
  await pool.end();
}

// why: D-13405 exit-code domain {0, 1, 2} — exit 0 even when
// errorCount > 0; per-row faults are logged to stderr and tracked in
// `legendary.stripe_events.process_error` for forensic review. Cron
// pages only on fatal startup faults (exit 2) or unexpected JS
// exceptions escaping the try/finally (Node default exit 1).
process.exit(0);
