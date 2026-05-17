/**
 * Avatar Upload Logic — Server Layer (WP-106)
 *
 * Processing pipeline for avatar uploads: MIME validation via magic
 * bytes, rate limiting, sharp-based resize + webp conversion, R2 PUT,
 * DB update, and compensating delete on DB failure.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package.
 *
 * Authority: WP-106 §Non-Negotiable Constraints; EC-171 §Locked
 * Values; D-10601 (upload validation policy); D-10602 (endpoint
 * contract).
 */

import sharp from 'sharp';
import type {
  AccountId,
  AvatarR2Client,
  AvatarUploadResponse,
  DatabaseClient,
} from './avatarUpload.types.js';

/**
 * Locked MIME allowlist per D-10601. Only these three image formats
 * are accepted; no GIF, no SVG, no TIFF/BMP.
 */
const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Magic byte signatures for allowed MIME types. The buffer is sniffed
 * against these before trusting any Content-Type header.
 */
const MAGIC_BYTES: ReadonlyArray<{
  mime: string;
  bytes: readonly number[];
  offset: number;
}> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
];

/**
 * WebP requires a secondary check: bytes 8-11 must be "WEBP" after
 * the initial RIFF header.
 */
const WEBP_SECONDARY_BYTES: readonly number[] = [0x57, 0x45, 0x42, 0x50];
const WEBP_SECONDARY_OFFSET = 8;

/**
 * Maximum file size in bytes (5 MB) per D-10601.
 */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Maximum pixel count for decode safety per D-10601.
 */
const MAX_INPUT_PIXELS = 20_000_000;

/**
 * Rate limit: 1 upload per 60 seconds per user per D-10601.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;

// why: in-memory rate limit is acceptable at MVP scale (<10K users).
// The map grows linearly with active users (one timestamp per user).
// Cleared on process restart — acceptable tradeoff for MVP. No DB
// round-trip for the rate check keeps the reject-path fast.
const rateLimitMap = new Map<string, number>();

/**
 * CDN base URL for avatar objects. The canonical avatar URL for a
 * given account is `${AVATAR_CDN_BASE}/${accountId}.webp`.
 */
const AVATAR_CDN_BASE = 'https://images.barefootbetters.com/avatars';

/**
 * R2 key prefix for avatar objects.
 */
const AVATAR_KEY_PREFIX = 'avatars';

/**
 * Sniff the buffer's magic bytes to determine if it matches one of
 * the allowed MIME types. Returns the matched MIME string or `null`.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  for (const signature of MAGIC_BYTES) {
    if (buffer.length < signature.offset + signature.bytes.length) {
      continue;
    }
    let isMatch = true;
    for (let i = 0; i < signature.bytes.length; i += 1) {
      if (buffer[signature.offset + i] !== signature.bytes[i]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch === false) {
      continue;
    }
    if (signature.mime === 'image/webp') {
      if (buffer.length < WEBP_SECONDARY_OFFSET + WEBP_SECONDARY_BYTES.length) {
        continue;
      }
      let isWebp = true;
      for (let i = 0; i < WEBP_SECONDARY_BYTES.length; i += 1) {
        if (buffer[WEBP_SECONDARY_OFFSET + i] !== WEBP_SECONDARY_BYTES[i]) {
          isWebp = false;
          break;
        }
      }
      if (isWebp === false) {
        continue;
      }
    }
    return signature.mime;
  }
  return null;
}

/**
 * Check the rate limit for a given account. Returns `true` if the
 * request is allowed, `false` if rate-limited.
 */
export function checkRateLimit(accountId: string, nowMs: number): boolean {
  const lastUpload = rateLimitMap.get(accountId);
  if (lastUpload !== undefined && nowMs - lastUpload < RATE_LIMIT_WINDOW_MS) {
    return false;
  }
  rateLimitMap.set(accountId, nowMs);
  return true;
}

/**
 * Reset rate limit state. Exposed for testing only.
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}

/**
 * Build the canonical avatar CDN URL for an account.
 */
export function buildAvatarUrl(accountId: string): string {
  return `${AVATAR_CDN_BASE}/${accountId}.webp`;
}

/**
 * Build the R2 object key for an account's avatar.
 */
function buildR2Key(accountId: string): string {
  return `${AVATAR_KEY_PREFIX}/${accountId}.webp`;
}

/**
 * Process an uploaded avatar buffer: validate MIME via magic bytes,
 * check rate limit, resize to 256x256 webp, PUT to R2, UPDATE the
 * DB, and return the CDN URL. On DB failure after R2 PUT, issues a
 * compensating DELETE.
 */
export async function processAvatarUpload(
  buffer: Buffer,
  accountId: AccountId,
  database: DatabaseClient,
  r2Client: AvatarR2Client,
  r2BucketName: string,
): Promise<AvatarUploadResponse> {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      code: 'file_too_large',
      message: `The uploaded file exceeds the maximum allowed size of 5 MB; received ${buffer.length} bytes.`,
    };
  }

  const detectedMime = sniffMimeType(buffer);
  if (detectedMime === null || ALLOWED_MIME_TYPES.includes(detectedMime) === false) {
    return {
      ok: false,
      code: 'invalid_mime_type',
      message: 'The uploaded file is not a supported image format; only JPEG, PNG, and WebP are accepted.',
    };
  }

  const isAllowed = checkRateLimit(accountId, Date.now());
  if (isAllowed === false) {
    return {
      ok: false,
      code: 'rate_limited',
      message: 'Avatar uploads are limited to one per 60 seconds; please wait before uploading again.',
    };
  }

  let processedBuffer: Buffer;
  try {
    // why: .rotate() auto-orients based on EXIF orientation tag and
    // then discards all EXIF/XMP/IPTC metadata from the output.
    // .withMetadata() is NOT called — this ensures metadata is stripped.
    processedBuffer = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(256, 256, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (sharpError: unknown) {
    const errorMessage = sharpError instanceof Error ? sharpError.message : 'unknown';
    if (errorMessage.includes('Input image exceeds pixel limit')) {
      return {
        ok: false,
        code: 'file_too_large',
        message: 'The uploaded image exceeds the maximum allowed pixel count of 20 megapixels.',
      };
    }
    return {
      ok: false,
      code: 'upload_failed',
      message: `Image processing failed; the file may be corrupted or in an unsupported variant. Detail: ${errorMessage}`,
    };
  }

  const r2Key = buildR2Key(accountId);
  const avatarUrl = buildAvatarUrl(accountId);

  try {
    // why: Cache-Control: public, max-age=300 — short caching prevents
    // stale avatars when the user re-uploads (same key, new content).
    // 5 minutes is long enough for CDN edge benefit but short enough
    // that a re-upload is visible within a reasonable window.
    await r2Client.putObject({
      bucket: r2BucketName,
      key: r2Key,
      body: processedBuffer,
      contentType: 'image/webp',
      cacheControl: 'public, max-age=300',
    });
  } catch {
    return {
      ok: false,
      code: 'upload_failed',
      message: 'Failed to store the processed avatar in object storage; the R2 PUT operation did not complete.',
    };
  }

  try {
    await database.query(
      'UPDATE legendary.player_profiles SET avatar_url = $1, updated_at = now() WHERE player_id = (SELECT player_id FROM legendary.players WHERE ext_id = $2 LIMIT 1)',
      [avatarUrl, accountId],
    );
  } catch (databaseError: unknown) {
    // why: compensating delete — if the DB update fails after R2 PUT
    // succeeds, delete the R2 object so we don't accumulate orphans.
    // If the compensating DELETE itself fails, we accept the orphan
    // risk at MVP scale and still return 500.
    try {
      await r2Client.deleteObject({ bucket: r2BucketName, key: r2Key });
    } catch (deleteError: unknown) {
      const deleteMessage = deleteError instanceof Error ? deleteError.message : 'unknown';
      console.error(
        `[avatar-upload] Compensating R2 DELETE failed for key "${r2Key}" after DB update failure. ` +
          `Orphan object may exist. Delete error: ${deleteMessage}`,
      );
    }
    const dbMessage = databaseError instanceof Error ? databaseError.message : 'unknown';
    return {
      ok: false,
      code: 'upload_failed',
      message: `Database update failed after storing the avatar; the upload was rolled back. Detail: ${dbMessage}`,
    };
  }

  return { ok: true, value: { avatarUrl } };
}
