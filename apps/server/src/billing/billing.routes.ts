/**
 * Billing HTTP Routes — Server Layer (WP-133)
 *
 * Registers two HTTP endpoints on the existing Koa router returned by
 * boardgame.io's `Server({...})` instance:
 *
 *   * `POST /api/billing/checkout-session` —
 *     `authenticated-session-required`; body `{ priceId: string }`;
 *     extra fields → 400 `'invalid_request'`; allowlist gate fires
 *     BEFORE any Stripe call; `successUrl`/`cancelUrl` server-derived
 *     from `billingConfig.publicBaseUrl`. Status-code domain
 *     `{200, 400, 401, 500, 503}`.
 *
 *   * `POST /api/billing/webhook/stripe` — `guest` (Stripe signature
 *     IS the auth); raw-body middleware captures bytes-identical
 *     payload BEFORE any global JSON parser; `constructEvent` rejects
 *     tampered bodies; verified events go to `recordStripeEvent` which
 *     INSERTs with `ON CONFLICT (event_id) DO NOTHING`. Status-code
 *     domain `{200, 400, 500}`. Zero `event.type` filtering — WP-134
 *     is the sole classifier.
 *
 * Mirrors the WP-104 / WP-115 / WP-132 structural shape: local
 * `KoaRouter` / `KoaContext` interfaces (no direct `@koa/router`
 * import), the caller-injected dependency bundle, and a
 * `Cache-Control: no-store` header set as the FIRST statement of
 * every handler body per WP-115 D-11504.
 *
 * Layer-boundary contract: this module imports `stripe` (the only
 * billing-directory consumer of the SDK per the EC-136 §5 grep gate),
 * `./billing.types.js`, and `./billing.logic.js`. No imports from
 * `boardgame.io`, `@legendary-arena/(game-engine|registry|preplan)`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package.
 *
 * Authority: WP-133 §Scope (In) §E; EC-136 §1 (route-level AC lock);
 * EC-136 §2 (status-code domains; envelope split; webhook-handler
 * scope lock); EC-136 §3 (allowlist-before-Stripe + raw-body-first +
 * server-derived-URLs + no-event-type-filter guardrails);
 * D-13301 (module path); D-13304 (route-level raw-body middleware);
 * D-13305 (allowlist source); D-13309 (env-derived publicBaseUrl);
 * WP-104 D-10403 (account-existence-probe defense — auth codes
 * collapse to 'unauthorized'); WP-115 D-11504 (Cache-Control first-
 * statement lock); WP-115 D-11802 = (C) (operational 500 envelope).
 */

import type Stripe from 'stripe';
import type { IncomingMessage } from 'node:http';

import type {
  AccountId,
  BillingConfig,
  DatabaseClient,
} from './billing.types.js';
import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';
import {
  createCheckoutSession,
  recordStripeEvent,
} from './billing.logic.js';

/**
 * Closed-set re-statement of the orchestrator's
 * `Result<AccountId, SessionValidationErrorCode>` shape (declared
 * locally per WP-104 / WP-132 precedent so this file does not
 * import from `../identity/identity.types.js` for a type already
 * carried by `RequireAuthenticatedSessionOptions`).
 */
type SessionValidationCode =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'unknown_account'
  | 'session_verifier_not_configured'
  | 'lookup_failed';

type RequireAuthenticatedSessionResult =
  | { ok: true; value: AccountId }
  | { ok: false; reason: string; code: SessionValidationCode };

/**
 * Caller-injected dependency bundle for `registerBillingRoutes`.
 * Mirrors the WP-104 / WP-109 / WP-132 `*RouteDependencies` shape
 * with two billing-specific additions: `billingConfig` (constructed
 * once at startup from env vars) and `stripeClient` (constructed
 * once at startup from `billingConfig.stripeSecretKey`). Both are
 * `undefined` when the non-production missing-env path leaves
 * billing not configured; the routes return 503
 * `'billing_not_configured'` in that case.
 */
export interface BillingRouteDependencies {
  readonly requireAuthenticatedSession: (
    req: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<RequireAuthenticatedSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
  readonly billingConfig?: BillingConfig;
  readonly stripeClient?: Stripe;
  /**
   * Resolves the validated `accountId` to a Stripe-ready
   * `customer_email` value. Caller-injected so production wiring
   * passes a real database lookup and tests inject a stub. The
   * resolver MUST never read request input; the email is sourced
   * from `legendary.players.email` (per WP-052 D-5201) for the
   * authenticated account.
   */
  readonly resolveCustomerEmail?: (
    accountId: AccountId,
    database: DatabaseClient,
  ) => Promise<string | null>;
}

interface KoaBillingRequest extends SessionTokenRequest {
  body?: unknown;
  rawBody?: string;
}

interface KoaBillingContext {
  readonly req: IncomingMessage;
  request: KoaBillingRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

interface KoaRouter {
  post(
    path: string,
    ...handlers: ReadonlyArray<
      (
        koaContext: KoaBillingContext,
        next: () => Promise<void>,
      ) => Promise<void> | void
    >
  ): unknown;
}

// why: D-13304 — the webhook handler MUST receive the bytes-identical
// raw body for `stripe.webhooks.constructEvent(rawBody, sig, secret)`
// to verify the HMAC signature; any JSON parse + restringify
// invalidates the signature. The middleware below is route-scoped
// (registered only on the webhook path) so the global JSON parser
// remains unchanged for every other route including
// `POST /api/billing/checkout-session`. The `jsonLimit: '1mb'` cap
// prevents oversized payload abuse while remaining well above
// current Stripe event sizes (typical events are under 50kb).
const RAW_BODY_LIMIT_BYTES = 1024 * 1024;

async function captureRawBodyMiddleware(
  koaContext: KoaBillingContext,
  next: () => Promise<void>,
): Promise<void> {
  if (typeof koaContext.request.rawBody === 'string') {
    // why: tests inject `rawBody` directly on the constructed Koa
    // context; capture is a no-op in that case. Production callers
    // see this branch when an upstream Koa middleware already
    // populated `rawBody` (e.g., `koa-body` configured with
    // `includeUnparsed: true`).
    await next();
    return;
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  await new Promise<void>((resolve, reject) => {
    koaContext.req.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > RAW_BODY_LIMIT_BYTES) {
        reject(
          new Error(
            'Stripe webhook payload exceeded the 1mb raw-body size cap; reject as oversized payload abuse.',
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    koaContext.req.on('end', () => resolve());
    koaContext.req.on('error', (streamError: Error) => reject(streamError));
  });
  koaContext.request.rawBody = Buffer.concat(chunks).toString('utf8');
  await next();
}

function statusForSessionValidationCode(code: SessionValidationCode): number {
  if (
    code === 'session_verifier_not_configured' ||
    code === 'lookup_failed'
  ) {
    return 500;
  }
  return 401;
}

/**
 * Register the two billing routes on the supplied Koa router. The
 * router is mutated in place; the function returns `void`.
 */
export function registerBillingRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: BillingRouteDependencies,
): void {
  router.post('/api/billing/checkout-session', async (koaContext) => {
    // why: Cache-Control MUST be the first statement in every handler
    // body per WP-115 D-11504 lock so a thrown exception still leaves
    // the header set on the eventual 500 response — billing
    // responses must never be cached by an intermediate proxy.
    koaContext.set('Cache-Control', 'no-store');
    try {
      if (deps.billingConfig === undefined || deps.stripeClient === undefined) {
        koaContext.status = 503;
        koaContext.body = { code: 'billing_not_configured' };
        return;
      }
      const sessionResult = await deps.requireAuthenticatedSession(
        koaContext.request,
        {
          verifier: deps.verifier,
          accountResolver: deps.accountResolver,
          database,
        },
      );
      if (sessionResult.ok === false) {
        const status = statusForSessionValidationCode(sessionResult.code);
        koaContext.status = status;
        if (status === 401) {
          // why: WP-104 D-10403 — auth codes ('missing_token',
          // 'invalid_token', 'expired_token', 'unknown_account')
          // collapse to a single 'unauthorized' value to defeat the
          // account-existence-probe defense.
          koaContext.body = { code: 'unauthorized' };
          return;
        }
        if (sessionResult.code === 'session_verifier_not_configured') {
          koaContext.body = { code: 'session_verifier_not_configured' };
          return;
        }
        koaContext.body = { error: 'internal_error' };
        return;
      }
      const accountId = sessionResult.value;
      const rawBody = koaContext.request.body;
      if (
        rawBody === undefined ||
        rawBody === null ||
        typeof rawBody !== 'object'
      ) {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_request' };
        return;
      }
      const requestRecord = rawBody as Record<string, unknown>;
      const priceId = requestRecord.priceId;
      if (typeof priceId !== 'string' || priceId.length === 0) {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_request' };
        return;
      }
      // why: locked exact-shape — any field beyond `priceId` returns
      // 400 'invalid_request'. Accepting `successUrl` / `cancelUrl` /
      // `redirectUri` from request input would permit a redirect-
      // manipulation attack (post-payment phishing); the URL values
      // MUST be server-derived from billingConfig.publicBaseUrl per
      // D-13309. Tests post `{ priceId, successUrl }` and assert 400.
      const expectedKeys = new Set(['priceId']);
      for (const key of Object.keys(requestRecord)) {
        if (expectedKeys.has(key) === false) {
          koaContext.status = 400;
          koaContext.body = { code: 'invalid_request' };
          return;
        }
      }

      const customerEmail =
        deps.resolveCustomerEmail === undefined
          ? null
          : await deps.resolveCustomerEmail(accountId, database);
      if (customerEmail === null) {
        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
        return;
      }

      // why: D-13309 — successUrl and cancelUrl are derived from
      // billingConfig.publicBaseUrl + fixed paths at the route layer.
      // The literal `{CHECKOUT_SESSION_ID}` token is preserved so
      // Stripe expands it server-side at redirect time. Neither URL
      // value is read from request input under any circumstance.
      const successUrl = `${deps.billingConfig.publicBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${deps.billingConfig.publicBaseUrl}/billing/cancel`;

      const result = await createCheckoutSession({
        accountId,
        priceId,
        customerEmail,
        successUrl,
        cancelUrl,
        billingConfig: deps.billingConfig,
        database,
        stripeClient: deps.stripeClient,
      });
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      if (result.code === 'invalid_price') {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_price' };
        return;
      }
      if (result.code === 'stripe_error') {
        koaContext.status = 500;
        koaContext.body = { code: 'stripe_error' };
        return;
      }
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    } catch (caughtError) {
      // why: never re-throw to a global Koa handler — the 500
      // envelope is locked at `{ error: 'internal_error' }` per WP-115
      // D-11802 = (C). The caught value is intentionally discarded.
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.post(
    '/api/billing/webhook/stripe',
    captureRawBodyMiddleware,
    async (koaContext) => {
      // why: Cache-Control MUST be the first statement in every
      // handler body per WP-115 D-11504 lock; webhook responses must
      // never be cached by an intermediate proxy.
      koaContext.set('Cache-Control', 'no-store');
      try {
        if (
          deps.billingConfig === undefined ||
          deps.stripeClient === undefined
        ) {
          koaContext.status = 500;
          koaContext.body = { error: 'internal_error' };
          return;
        }
        const rawBody = koaContext.request.rawBody;
        if (typeof rawBody !== 'string') {
          koaContext.status = 400;
          koaContext.body = { code: 'invalid_signature' };
          return;
        }
        const signatureHeader =
          koaContext.request.headers['stripe-signature'];
        const signatureValue =
          typeof signatureHeader === 'string'
            ? signatureHeader
            : Array.isArray(signatureHeader)
              ? signatureHeader[0]
              : undefined;
        if (typeof signatureValue !== 'string') {
          koaContext.status = 400;
          koaContext.body = { code: 'invalid_signature' };
          return;
        }
        let event: Stripe.Event;
        try {
          event = deps.stripeClient.webhooks.constructEvent(
            rawBody,
            signatureValue,
            deps.billingConfig.webhookSecret,
          );
        } catch (verifyError) {
          // why: signature verification failure surfaces as 400 with
          // a deterministic 'invalid_signature' code so probe traffic
          // and tampered traffic are distinguishable in logs without
          // a silent 200 or 500.
          void verifyError;
          koaContext.status = 400;
          koaContext.body = { code: 'invalid_signature' };
          return;
        }

        // why: WP-133 ingests EVERY verified event without any
        // event.type filter. WP-134 is the sole classifier; dropping
        // an event here would make replay impossible for event types
        // WP-134 may need later. The fast-return invariant
        // (raw-body parse + signature verify + single INSERT + 200)
        // forbids any synchronous Stripe API call after this point.
        const recordResult = await recordStripeEvent({
          event,
          database,
        });
        if (recordResult.ok === false) {
          koaContext.status = 500;
          koaContext.body = { error: 'internal_error' };
          return;
        }
        koaContext.status = 200;
        koaContext.body = {
          received: true,
          duplicate: recordResult.value.inserted === false,
        };
      } catch (caughtError) {
        void caughtError;
        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
      }
    },
  );
}
