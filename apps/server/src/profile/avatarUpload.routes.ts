/**
 * Avatar Upload HTTP Routes — Server Layer (WP-106)
 *
 * Registers the `POST /api/me/avatar` endpoint on the existing Koa
 * router. Uses `@koa/multer` for multipart parsing with locked
 * limits per D-10602. The route handler delegates all processing
 * to `avatarUpload.logic.ts` for independent testability.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package.
 *
 * Authority: WP-106 §Scope (In); D-10602 (endpoint contract);
 * D-11202 (bearer header); D-11504 (Cache-Control first-statement).
 */

import multer from '@koa/multer';
import type {
  AccountId,
  AvatarUploadRouteDependencies,
  DatabaseClient,
  SessionTokenRequest,
} from './avatarUpload.types.js';
import { processAvatarUpload } from './avatarUpload.logic.js';

/**
 * Minimal structural shape of the Koa context surface this module
 * touches. Mirrors the WP-104 `KoaOwnerProfileContext` precedent.
 */
interface KoaAvatarContext {
  readonly req: SessionTokenRequest;
  request: { body?: unknown };
  status: number;
  body: unknown;
  file?: { buffer: Buffer; mimetype: string; size: number };
  set(field: string, value: string): void;
}

/**
 * Minimal structural shape of the Koa router surface this module
 * touches.
 */
interface KoaRouter {
  post(
    path: string,
    ...handlers: Array<(ctx: KoaAvatarContext, next?: () => Promise<void>) => Promise<void> | void>
  ): unknown;
}

/**
 * Register the avatar upload route (`POST /api/me/avatar`) on the
 * supplied Koa router. The multer middleware parses the multipart
 * body with locked limits per D-10602.
 */
export function registerAvatarUploadRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: AvatarUploadRouteDependencies,
): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 0,
    },
  });

  const uploadMiddleware = upload.single('avatar');

  router.post('/api/me/avatar', async (koaContext: KoaAvatarContext) => {
    // why: Cache-Control MUST be the first statement in every handler
    // body per WP-115 D-11504 lock so a thrown exception still leaves
    // the header set on the eventual 500 response.
    koaContext.set('Cache-Control', 'no-store');

    try {
      const sessionResult = await deps.requireAuthenticatedSession(koaContext.req, {
        verifier: deps.verifier,
        accountResolver: deps.accountResolver,
        database,
      });
      if (sessionResult.ok === false) {
        koaContext.status = 401;
        koaContext.body = { code: 'unauthorized', message: 'Session validation failed; a valid authenticated session is required.' };
        return;
      }
      const accountId: AccountId = sessionResult.value;

      try {
        await (uploadMiddleware as (ctx: unknown, next: () => Promise<void>) => Promise<void>)(
          koaContext,
          async () => { /* noop next */ },
        );
      } catch (multerError: unknown) {
        if (multerError instanceof Error && multerError.message.includes('File too large')) {
          koaContext.status = 400;
          koaContext.body = { code: 'file_too_large', message: 'The uploaded file exceeds the maximum allowed size of 5 MB.' };
          return;
        }
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_mime_type', message: 'The upload could not be parsed; ensure the request uses multipart/form-data with a single file field named "avatar".' };
        return;
      }

      const file = koaContext.file;
      if (file === undefined || file === null) {
        koaContext.status = 400;
        koaContext.body = { code: 'invalid_mime_type', message: 'No file was included in the upload; the "avatar" field is required.' };
        return;
      }

      const result = await processAvatarUpload(
        file.buffer,
        accountId,
        database,
        deps.r2Client,
        deps.r2BucketName,
      );

      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = { avatarUrl: result.value.avatarUrl };
        return;
      }

      const statusMap: Record<string, number> = {
        invalid_mime_type: 400,
        file_too_large: 400,
        rate_limited: 429,
        upload_failed: 500,
      };
      koaContext.status = statusMap[result.code] ?? 500;
      koaContext.body = { code: result.code, message: result.message };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { code: 'upload_failed', message: 'An unexpected error occurred during the avatar upload.' };
    }
  });
}
