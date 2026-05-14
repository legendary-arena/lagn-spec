/**
 * Legends Publisher Routes — Health Endpoint (WP-142)
 *
 * Registers `GET /health/legends-publisher` on the Koa router.
 * No auth required — this is a public health-check endpoint for
 * monitoring the publisher's operational state.
 *
 * Layer-boundary contract: no engine, registry, preplan, or UI imports.
 *
 * Authority: WP-142 §D; EC-157 §Locked Values; D-14206.
 */

import { getLegendsPublisherHealth } from './legends.scheduler.js';

/**
 * Registers the legends publisher health route on the Koa router.
 *
 * @param router - The server's Koa router instance.
 */
// why: no auth on this endpoint per EC-157 §Locked Values — it
// returns operational metrics only (timestamps + status), no PII,
// no game state, no user data. Identical posture to the existing
// `GET /health` endpoint registered at server.mjs:47.
export function registerLegendsPublisherRoutes(
  router: { get: (path: string, handler: (ctx: { body: unknown }) => void) => void },
): void {
  router.get('/health/legends-publisher', (koaContext) => {
    koaContext.body = getLegendsPublisherHealth();
  });
}
