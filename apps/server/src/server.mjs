/**
 * Legendary Arena -- boardgame.io Game Server
 *
 * Wiring layer: loads the card registry and rules, creates the boardgame.io
 * Server(), configures CORS, exposes a /health endpoint, and listens on the
 * configured port.
 *
 * This file must not contain game logic. It connects pieces -- it does not
 * decide what happens in the game.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createRegistryFromLocalFiles,
  validateThemeFile,
} from '@legendary-arena/registry';
import { buildScenarioKey } from '@legendary-arena/game-engine';
import { loadRules, getRules } from './rules/loader.mjs';
import { createParGate } from './par/parGate.mjs';
import { createPool } from './db/database.js';
import { registerLeaderboardRoutes } from './leaderboards/leaderboard.routes.js';
import { registerOwnerProfileRoutes } from './profile/ownerProfile.routes.js';
import { registerAvatarUploadRoutes } from './profile/avatarUpload.routes.js';
import { registerProfileRoutes } from './profile/profile.routes.js';
import { registerTeamRoutes } from './teams/team.routes.js';
import { registerEntitlementRoutes } from './entitlements/entitlements.routes.js';
import { registerBillingRoutes } from './billing/billing.routes.js';
import { registerAdminBillingRoutes } from './billing/adminBilling.routes.js';
import { registerAdminProfileRoutes } from './profile/admin/adminProfile.routes.js';
import { registerAnalyticsRoutes } from './analytics/analytics.routes.js';
import { getAnalyticsUserIdSalt } from './analytics/userIdHash.js';
import { requireAdminSession } from './auth/adminSession.js';
import { loadBillingConfig, createStripeClient } from './billing/billing.config.js';
import { registerLegendsPublisherRoutes } from './legends/legends.routes.js';
import { registerAutoplayRoutes } from './autoplay/autoplay.mjs';
import { requireAuthenticatedSession } from './auth/sessionToken.logic.js';
import { createHankoSessionVerifier } from './auth/hanko/hankoVerifier.logic.js';
import { productionAccountResolver } from './auth/accountResolver.logic.js';
import { LegendaryGame, setRegistryForSetup } from '@legendary-arena/game-engine';
import { getVersionInfo } from './version.mjs';

// why: boardgame.io v0.50 only ships a CJS server bundle (dist/cjs/server.js)
// with no ESM entrypoint. Node v22+ ESM does not resolve CJS-only subpackage
// directory imports. createRequire bridges this gap without adding a bundler.
const require = createRequire(import.meta.url);
const { Server } = require('boardgame.io/server');

/**
 * Registers the /health endpoint on the boardgame.io koa router.
 * Returns { status: 'ok' } for Render health checks and pnpm check.
 *
 * @param {import('@koa/router')} router - The boardgame.io server's koa router.
 */
function registerHealthRoute(router) {
  router.get('/health', (koaContext) => {
    koaContext.body = { status: 'ok' };
  });
}

// why: WP-150 / D-15001 — build the themeId → scenarioKey[] map at
// startup from the 70 JSON files under `content/themes/*.json`,
// using the registry's exported `validateThemeFile` validator
// (never-throw structured-result contract) and the engine's
// canonical `buildScenarioKey` helper. The leaderboards module
// (`apps/server/src/leaderboards/**`) is layer-boundary-pure: it
// never imports `@legendary-arena/registry` or
// `@legendary-arena/game-engine`. The mapping is built in this
// wiring layer and injected into `registerLeaderboardRoutes` as a
// bound function, mirroring the `checkParPublished` precedent.
// Mapping is pure and read-only — the returned Map is frozen for
// the process lifetime. Each theme produces exactly one
// scenarioKey (singleton array) because a `ThemeDefinition` carries
// exactly one `setupIntent`; the singleton-array shape keeps the
// dep contract forward-compatible with future multi-setup themes.
// Invalid theme files are logged and skipped (fail-soft) — the
// startup never blocks on a single bad file.
/**
 * Builds the themeId → scenarioKey[] mapping from
 * `content/themes/*.json` at startup. Returns a read-only map keyed
 * by kebab-case themeId. Skipped + reported on per-file validation
 * failure; the loader never throws.
 *
 * @returns {Promise<ReadonlyMap<string, readonly string[]>>}
 */
async function buildThemeScenarioKeyMap() {
  const themesDirectory = 'content/themes';
  const mapping = new Map();

  let entries;
  try {
    entries = await readdir(themesDirectory);
  } catch (error) {
    // why: missing directory is not fatal — the server runs without
    // any theme mapping (theme route surfaces 404 by construction)
    // so local-dev workflows without `content/themes/` keep working.
    // Production deploys always carry the directory; absence there
    // would be a separate failure surfaced via the 404 rate.
    console.warn(
      `[server] theme directory not readable at "${themesDirectory}"; ` +
        `theme leaderboard endpoint will surface 404 for every themeId. ` +
        `Error: ${error.message}`,
    );
    return mapping;
  }

  const themeFiles = entries.filter((name) => name.endsWith('.json'));
  let loaded = 0;
  let skipped = 0;
  for (const fileName of themeFiles) {
    const filePath = join(themesDirectory, fileName);
    const result = await validateThemeFile(filePath);
    if (result.success === false) {
      skipped = skipped + 1;
      const firstError = result.errors[0];
      console.warn(
        `[server] theme file "${filePath}" failed validation (${firstError.path}): ` +
          `${firstError.message} — skipped`,
      );
      continue;
    }
    const theme = result.theme;
    const scenarioKey = buildScenarioKey(
      theme.setupIntent.schemeId,
      theme.setupIntent.mastermindId,
      theme.setupIntent.villainGroupIds,
    );
    // why: singleton array per D-15001 — a ThemeDefinition has
    // exactly one setupIntent, so the projection is 1:1. The
    // injection shape `readonly string[] | null` keeps room for
    // future multi-setup theme variants without breaking the
    // contract.
    mapping.set(theme.themeId, Object.freeze([scenarioKey]));
    loaded = loaded + 1;
  }

  console.log(
    `[server] themes loaded: ${loaded} mapped, ${skipped} skipped ` +
      `(theme → scenarioKey via buildScenarioKey per D-15001)`,
  );
  return mapping;
}

/**
 * Loads the card registry from local JSON files in data/metadata/ and
 * data/cards/. Logs a summary on success. On failure, logs a full-sentence
 * error and exits the process.
 *
 * @returns {Promise<import('@legendary-arena/registry').CardRegistry>}
 */
async function loadRegistry() {
  try {
    // why: The server loads card data from local files at startup, not via
    // the HTTP/R2 loader. The HTTP loader is for browser clients that fetch
    // card data from Cloudflare R2. The server has direct filesystem access
    // to data/, so local loading is simpler and avoids a network round-trip.
    const registry = await createRegistryFromLocalFiles({
      metadataDir: 'data/metadata',
      cardsDir: 'data/cards',
    });

    const registryInfo = registry.info();
    console.log(
      `[server] registry loaded: ${registryInfo.totalSets} sets, ` +
      `${registryInfo.totalHeroes} heroes, ${registryInfo.totalCards} cards`
    );

    return registry;
  } catch (error) {
    console.error(
      `[server] Failed to load card registry from local files. ` +
      `Check that data/metadata/sets.json and data/cards/ exist. ` +
      `Error: ${error.message}`
    );
    process.exit(1);
  }
}

// why: `tryConstructHankoVerifier()` implements the D-13101
// startup-policy gate — it is NOT a "best-effort" attempt despite
// the `try` prefix. The `try` prefix names the return type
// (`SessionVerifier | undefined`); the production-vs-non-production
// branching IS the policy. In production, missing or invalid env
// is a fatal misconfiguration (throw → caller `index.mjs` propagates
// → process.exit(1)); in non-production, the helper deliberately
// returns `undefined` to preserve local-dev ergonomics for engineers
// iterating on non-authenticated routes who do not need a Hanko
// tenant. This mirrors the `DATABASE_URL` startup posture in
// `index.mjs:34`.
/**
 * Constructs the Hanko `SessionVerifier` from environment variables
 * if both `HANKO_TENANT_BASE_URL` and `HANKO_EXPECTED_AUDIENCE` are
 * present and non-empty. Branches on `NODE_ENV` per D-13101:
 *
 * - Production + complete env: constructs the verifier, logs the
 *   masked configuration line per D-13104 (origin preserved, path
 *   replaced with `***`), returns the verifier.
 * - Production + incomplete env: throws a full-sentence diagnostic
 *   that the caller (`index.mjs`) surfaces before `process.exit(1)`.
 * - Non-production + complete env: identical to the production
 *   complete-env path (same log line + return).
 * - Non-production + incomplete env: logs the fail-closed-dev-mode
 *   diagnostic and returns `undefined` so authenticated routes
 *   continue to surface `'session_verifier_not_configured'` per
 *   the WP-112 D-11204 default — preserves the pre-WP-131
 *   local-dev ergonomics verbatim.
 *
 * Constructs the verifier exactly once per call. The single
 * construction site mirrors the `pool = createPool()` invariant.
 *
 * @returns {import('./auth/sessionToken.types.js').SessionVerifier | undefined}
 */
export function tryConstructHankoVerifier() {
  const tenantBaseUrl = process.env.HANKO_TENANT_BASE_URL;
  const expectedAudience = process.env.HANKO_EXPECTED_AUDIENCE;
  const refreshIntervalRaw = process.env.HANKO_JWKS_REFRESH_INTERVAL_MS;

  const envComplete =
    typeof tenantBaseUrl === 'string' &&
    tenantBaseUrl.length > 0 &&
    typeof expectedAudience === 'string' &&
    expectedAudience.length > 0;

  if (envComplete) {
    // why: `Number(undefined)` produces `NaN`, and so does
    // `Number("typo")` / `Number("")` / `Number("123abc")` — any of
    // which would defeat the D-12603 default substitution inside the
    // verifier factory (the factory checks `jwksRefreshIntervalMs ===
    // undefined` to apply the 300_000ms default; `NaN` is a number
    // and bypasses that branch, producing `setInterval(..., NaN)`
    // which the WHATWG timers spec coerces to 1ms — hammering Hanko's
    // JWKS endpoint). Surfaced 2026-05-24 by a production deploy log
    // showing `refresh=NaNms` after the env var was set to a
    // non-numeric value. The two-step parse + `Number.isFinite` guard
    // collapses every malformed shape (undefined, empty string,
    // non-numeric, Infinity, -Infinity, NaN) to `undefined` so the
    // factory's default-substitution branch fires.
    const parsedRefreshInterval =
      refreshIntervalRaw === undefined
        ? undefined
        : Number(refreshIntervalRaw);
    const jwksRefreshIntervalMs = Number.isFinite(parsedRefreshInterval)
      ? parsedRefreshInterval
      : undefined;

    try {
      const verifier = createHankoSessionVerifier({
        tenantBaseUrl,
        expectedAudience,
        jwksRefreshIntervalMs,
      });

      // why: D-13104 origin-only masking — the path component is
      // replaced with `***` so accidental log-aggregation exposure
      // (Datadog, Loggly, etc.) does not leak the tenant ID. The
      // origin preserves the "did the env var resolve at all" signal
      // for operator diagnostics.
      let maskedTenantBaseUrl = tenantBaseUrl;
      try {
        const parsed = new URL(tenantBaseUrl);
        maskedTenantBaseUrl = `${parsed.origin}/***`;
      } catch {
        maskedTenantBaseUrl = '***';
      }
      const refreshLogged =
        jwksRefreshIntervalMs === undefined ? 'default' : jwksRefreshIntervalMs;
      console.log(
        `[server] Hanko verifier configured (tenantBaseUrl=${maskedTenantBaseUrl}, refresh=${refreshLogged}ms)`
      );
      return verifier;
    } catch (error) {
      console.error(
        `[server] Failed to construct Hanko verifier. ` +
          `Set HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE in the Render dashboard. ` +
          `Error: ${error.message}`
      );
      throw error;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Hanko verifier configuration is incomplete. Set HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE in the Render dashboard before deploying. Production cannot start without them.'
    );
  }

  console.log(
    `[server] Hanko verifier NOT configured — running in fail-closed dev mode (set HANKO_TENANT_BASE_URL + HANKO_EXPECTED_AUDIENCE to enable authenticated routes)`
  );
  return undefined;
}

/**
 * Starts the boardgame.io server after loading the card registry and rules
 * from PostgreSQL. Both startup tasks must succeed before the server accepts
 * requests. On failure, logs a full-sentence error and exits.
 *
 * @returns {Promise<{ appServer: import('http').Server, leaderboardDeps: import('./leaderboards/leaderboard.types.js').LeaderboardDependencies, pool: import('pg').Pool }>}
 *   The running HTTP server instance, the leaderboard deps bundle (for
 *   the legends publisher), and the long-lived `pg.Pool`. The caller
 *   (`apps/server/src/index.mjs`) closes the pool from the SIGTERM
 *   path after the HTTP server's graceful-shutdown step resolves.
 */
export async function startServer() {
  // why: PAR gate is the third independent startup task per WP-051 / D-5101.
  // Non-blocking: createParGate handles all failure modes internally
  // (warn-log + continue with partial or empty coverage per D-5101 graceful
  // degradation; server never crashes on PAR-load failure). PAR_VERSION env
  // var is read per D-5102; the ?? 'v1' fallback matches the PORT ?? '8000'
  // pattern below.
  const [registry, , parGate] = await Promise.all([
    loadRegistry(),
    loadRules(),
    createParGate('data/par', process.env.PAR_VERSION ?? 'v1'),
  ]);

  // why: D-10014 — engine's setRegistryForSetup() must be called
  // before Server() is constructed so Game.setup() sees the
  // registry on every match-create. WP-100 smoke test on
  // 2026-04-27 surfaced this gap: the server loaded the registry
  // but never wired it, so validateMatchSetup was silently
  // skipped via the `if (gameRegistry)` guard at game.ts:201-210
  // and every match was structurally empty.
  setRegistryForSetup(registry);

  const rules = getRules();
  const rulesCount = Object.keys(rules.rules).length;

  // why: boardgame.io Server() is the authoritative game server. On Render,
  // it handles both HTTP (health checks, lobby API) and WebSocket (real-time
  // game state sync) traffic on a single port. Render's load balancer
  // upgrades WebSocket connections automatically -- no separate WS port needed.
  const server = Server({
    games: [LegendaryGame],
    // why: CORS origins are written as a literal array per code style Rule 7.
    // Authorized cross-origin consumers of the boardgame.io lobby + match API:
    //   - https://play.legendary-arena.com — the production arena-client SPA
    //     deployed under WP-007a (CF Pages project legendary-arena-play).
    //   - https://legendary-arena.com — the marketing-site Hugo bundle root
    //     (apex hostname). Needed for the WP-149 public-leaderboard page to
    //     call api.legendary-arena.com cross-origin.
    //   - https://www.legendary-arena.com — the www-canonical alternate.
    //     Hugo's baseURL resolves to www.*, but some browsers send the apex
    //     Origin even when the user typed www, and vice versa; both must be
    //     allowlisted for the leaderboard page to load on either form.
    //   - https://legendary-arena-play.pages.dev — the same project's CF
    //     Pages auto-generated hostname; needed for the WP-007a Step 9
    //     build-parity check before the custom domain binds, and as the
    //     stable preview-target in environments where the custom domain is
    //     unbound.
    //   - https://cards.barefootbetters.com — the legacy registry-viewer
    //     hostname. Retained byte-identical for the dual-running window
    //     during the operator-driven Cloudflare Pages dashboard custom-domain
    //     swap (per WP-146 / D-14601). Removal is owned by a separate
    //     post-cutover cleanup commit, not this packet.
    //   - https://cards.legendary-arena.com — the registry-viewer SPA at the
    //     new hostname; needed once the Cloudflare Pages dashboard cutover
    //     detaches cards.barefootbetters.com and attaches this domain to the
    //     legendary-arena Pages project (WP-146).
    //   - http://localhost:5173 — Vite dev server default for local dev
    //     work against this server.
    origins: [
      'https://play.legendary-arena.com',
      'https://legendary-arena.com',
      'https://www.legendary-arena.com',
      'https://legendary-arena-play.pages.dev',
      // why: WP-206 / D-20601 — dashboard analytics LIVE flip wiring.
      // The first entry below is the live operator-dashboard host per
      // docs/ops/DOMAINS.md §dashboard (CF Pages + CF Access, live
      // since 2026-06-02). The second is the Vite dashboard preview-
      // server default for local-dev LIVE-mode against the local
      // server. The 3 GET endpoints registered by
      // `registerAnalyticsRoutes` consume the operator's
      // cookie-credentials Hanko session via this CORS allowance.
      'https://dashboard.legendary-arena.com',
      'http://localhost:4173',
      'https://cards.barefootbetters.com',
      'https://cards.legendary-arena.com',
      'http://localhost:5173',
    ],
  });

  registerHealthRoute(server.router);

  // why: read-only diagnostics for deployment freshness verification
  server.router.get('/api/version', (koaContext) => {
    koaContext.body = getVersionInfo();
  });

  registerLegendsPublisherRoutes(server.router);

  // why: "Watch Bot Play" feature — server-side autoplay loop using
  // engine AI policies. No game logic here; the autoplay module dispatches
  // moves through boardgame.io's Master class using existing policies.
  const autoplayServerUrl = `http://localhost:${process.env.PORT ?? '8000'}`;
  registerAutoplayRoutes(server.router, {
    db: server.db,
    transport: server.transport,
    auth: server.auth,
    serverUrl: autoplayServerUrl,
  });

  // why: WP-115 — construct the long-lived pg.Pool exactly once
  // here. Lifetime is the process lifetime; close-on-SIGTERM is
  // owned by index.mjs (after the HTTP server's graceful-shutdown
  // step resolves), never by a route handler. parGate is now bound
  // (no longer dangling per the pre-existing `void parGate;`
  // placeholder removed in this commit) — registerLeaderboardRoutes
  // injects parGate.checkParPublished into every WP-054 call site.
  // WP-102's registerProfileRoutes is intentionally NOT wired here
  // per D-10202 — that follow-up WP owns its own commit even though
  // the pool introduced here is the lifecycle anchor it needs.
  const pool = createPool();
  console.log('[server] pg.Pool constructed (max=10)');
  const verifier = tryConstructHankoVerifier();

  // why: WP-150 / D-15001 + D-15002 — build the themeId →
  // scenarioKey[] map at startup (registry loaded, mapping
  // computed once, frozen for process lifetime) and inject a
  // bound `getScenarioKeysForTheme` alongside `parGate.checkParPublished`
  // in the same deps bundle. The leaderboards module never imports
  // the registry directly — it consumes a function reference only,
  // preserving the apps/server/src/leaderboards/** layer boundary
  // (registry-agnostic by design; layer boundary §2 authority).
  // Mapping is pure and read-only; theme files are loaded at
  // startup, not at request time. Injection pattern mirrors the
  // existing `checkParPublished` precedent at line 270 below.
  // Citations: D-15001 (themeId mapping rule), D-15002 (single
  // deps bundle), D-15003 (PAR-eligibility derivation for the
  // global Top-N endpoint that shares the same deps).
  const themeScenarioKeyMap = await buildThemeScenarioKeyMap();
  const getScenarioKeysForTheme = (themeId) => {
    const keys = themeScenarioKeyMap.get(themeId);
    return keys === undefined ? null : keys;
  };
  registerLeaderboardRoutes(server.router, pool, {
    checkParPublished: parGate.checkParPublished,
    getScenarioKeysForTheme,
  });

  // why: WP-104 / D-10408 — register the three owner-only routes
  // (/api/me/profile GET + PATCH, /api/me/links PUT) on the same
  // long-lived pool. requireAuthenticatedSession is the WP-112
  // orchestrator; the per-request `verifier` + `accountResolver`
  // bindings come from the deps bundle threaded here. WP-131 wires
  // the Hanko verifier (production) or leaves both fields undefined
  // (dev-mode + missing env) — the existing fail-closed orchestrator
  // path handles the dev-mode case unchanged, surfacing 500 with
  // code: 'session_verifier_not_configured' per D-11204.
  registerOwnerProfileRoutes(server.router, pool, {
    requireAuthenticatedSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
  });

  // why: WP-106 / D-10602 — register the avatar upload route
  // (POST /api/me/avatar) on the same long-lived pool. The R2
  // client is constructed identically to the legends publisher
  // pattern in index.mjs; the S3Client is reused for both PutObject
  // and DeleteObject (compensating action on DB failure). Same
  // caller-injected auth deps as registerOwnerProfileRoutes.
  const avatarS3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
  registerAvatarUploadRoutes(server.router, pool, {
    requireAuthenticatedSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
    r2Client: {
      async putObject(params) {
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        const command = new PutObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
          CacheControl: params.cacheControl,
        });
        await avatarS3Client.send(command);
      },
      async deleteObject(params) {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const command = new DeleteObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
        });
        await avatarS3Client.send(command);
      },
    },
    r2BucketName: process.env.R2_BUCKET_NAME ?? 'legendary-images',
  });

  // why: WP-152 / D-10202 / D-11505 — wire the public profile route.
  // Guest endpoint, no auth injection. Closes the D-10202 deferral.
  registerProfileRoutes(server.router, pool);

  // why: WP-109 / D-10408 — register the eight team-affiliation
  // routes (/api/teams + 7 team-scoped endpoints) on the same
  // long-lived pool. Same caller-injected pattern as
  // registerOwnerProfileRoutes. WP-131 wires the Hanko verifier
  // (production) or leaves both fields undefined (dev-mode +
  // missing env) — the existing fail-closed orchestrator path
  // handles the dev-mode case unchanged, surfacing 500 with
  // code: 'session_verifier_not_configured' per D-11204.
  registerTeamRoutes(server.router, pool, {
    requireAuthenticatedSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
  });

  // why: WP-132 / D-13205 (a) — register the single entitlements
  // read endpoint (GET /api/me/entitlements) on the same long-lived
  // pool, threading the SAME deps bundle WP-131 / EC-134 already
  // built for the owner-profile and team routes (no second verifier
  // or resolver constructed). The route is genuinely authenticated
  // from day one because WP-131 / EC-134 (Done 2026-05-04) already
  // wired the production Hanko verifier — the dev-mode 500 /
  // 'session_verifier_not_configured' branch (per D-13101) is a
  // contract that's reachable only when NODE_ENV != 'production',
  // not a routine response in production. The deps bundle shape is
  // identical to registerOwnerProfileRoutes / registerTeamRoutes.
  registerEntitlementRoutes(server.router, pool, {
    requireAuthenticatedSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
  });

  // why: WP-133 / D-13301 + D-13303 + D-13305 + D-13309 — load the
  // billing configuration once at startup (production-fatal on missing
  // env, mirrors WP-126 / WP-131 startup-guard precedent), then
  // construct the Stripe client once with the date-stamped apiVersion
  // pin per D-13303. Both bindings are undefined in non-production
  // missing-env mode; the routes return 503 'billing_not_configured'
  // in that case (fail-closed local-dev ergonomics). The deps bundle
  // mirrors the registerOwnerProfileRoutes / registerEntitlementRoutes
  // shape with two billing-specific additions (billingConfig +
  // stripeClient) and the customer-email resolver — the resolver
  // queries legendary.players.email by ext_id at request time so the
  // Stripe Checkout Session carries the authenticated owner's email
  // without ever reading request input (the email is server-derived,
  // mirroring the successUrl/cancelUrl D-13309 posture).
  const billingConfig = loadBillingConfig(process.env);
  const stripeClient =
    billingConfig === undefined
      ? undefined
      : createStripeClient(billingConfig);
  if (billingConfig !== undefined) {
    console.log(
      `[billing] startup: loaded ${billingConfig.priceAllowlist.size} price-allowlist entries`,
    );
  } else {
    console.log(
      '[billing] not configured (non-production); /api/billing/* routes return 503',
    );
  }
  registerBillingRoutes(server.router, pool, {
    requireAuthenticatedSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
    billingConfig,
    stripeClient,
    resolveCustomerEmail: async (accountId, database) => {
      const lookup = await database.query(
        'SELECT email FROM legendary.players WHERE ext_id = $1 LIMIT 1',
        [accountId],
      );
      if (lookup.rows.length === 0) {
        return null;
      }
      const emailValue = lookup.rows[0].email;
      return typeof emailValue === 'string' && emailValue.length > 0
        ? emailValue
        : null;
    },
  });

  // why: WP-176, D-17601 — admin billing auth cutover. The shared-secret
  // gate (admin-secret header per D-11001) is replaced by
  // the WP-159 session-based gate (requireAdminSession / Hanko session +
  // is_admin = TRUE). The deps bundle is structurally identical to the
  // registerAdminProfileRoutes call below.
  registerAdminBillingRoutes(server.router, pool, {
    requireAdminSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
  });

  // why: WP-107 / D-10701..D-10703 — register the three admin-only
  // profile integrity routes (GET integrity, POST suspend, POST
  // unsuspend) on the same long-lived pool. requireAdminSession is the
  // WP-159 helper; the per-request `verifier` + `accountResolver`
  // bindings come from the same deps bundle threaded into the WP-104 /
  // WP-109 / WP-132 / WP-133 routes. WP-131 wires the Hanko verifier
  // (production) or leaves both fields undefined (dev-mode + missing
  // env) — the existing fail-closed orchestrator path handles the
  // dev-mode case unchanged, surfacing 401 via the
  // 'session_verifier_not_configured' -> 'unauthorized' collapse
  // locked in WP-159 §A. WP-107 is the FIRST caller of
  // requireAdminSession.
  registerAdminProfileRoutes(server.router, pool, {
    requireAdminSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
  });

  // why: WP-205 / D-20501..D-20503 — register the four analytics
  // routes (POST /api/analytics/events capture endpoint + 3 GET
  // query endpoints). Salt loaded once at startup via
  // getAnalyticsUserIdSalt() per D-20502 (production loud-fail when
  // ANALYTICS_USER_ID_SALT is unset; test/dev returns the EC-233
  // §Locked Values fixed salt + one-shot warning). The deps bundle
  // threads the same { requireAuthenticatedSession, verifier,
  // accountResolver } trio used by every other authenticated route
  // plus the analyticsUserIdSalt — the hashing happens at the route
  // boundary BEFORE any INSERT so raw user_id never reaches the
  // persistence layer in cleartext. Capture endpoint is `guest`
  // (always-open posture per D-20503) with per-IP rate limit (60
  // events/min) and body size cap (8 KB single / 100 KB batch / 50
  // events max); the 3 GET query endpoints are
  // authenticated-session-required and use the same auth-code
  // collapse to 'unauthorized' per D-10403.
  const analyticsUserIdSalt = getAnalyticsUserIdSalt();
  registerAnalyticsRoutes(server.router, pool, {
    requireAuthenticatedSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
    analyticsUserIdSalt,
  });

  // why: Render.com injects PORT automatically. The fallback 8000 is for
  // local development only. Do not set PORT in the Render dashboard --
  // Render will override it anyway and double-setting causes confusion.
  const port = process.env.PORT ?? '8000';

  const { appServer } = await server.run({ port: Number(port) });

  console.log(
    `[server] listening on port ${port} ` +
    `(${rulesCount} rules loaded, NODE_ENV=${process.env.NODE_ENV ?? 'development'})`
  );

  return {
    appServer,
    leaderboardDeps: {
      checkParPublished: parGate.checkParPublished,
      getScenarioKeysForTheme,
    },
    pool,
  };
}
