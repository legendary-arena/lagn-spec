# EC-171 — Avatar Upload Pipeline (Execution Checklist)

**Source:** docs/ai/work-packets/WP-106-avatar-upload-pipeline.md
**Layer:** Server (`apps/server/src/profile/`)

## Before Starting
- [ ] WP-104 complete (player_profiles table + avatar_url column exist)
- [ ] WP-112 complete (session auth middleware wired)
- [ ] WP-126 complete (Hanko session verifier operational)
- [ ] R2 env vars accessible: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`
- [ ] `pnpm --filter server build` exits 0
- [ ] `pnpm --filter server test` exits 0

## Locked Values (do not re-derive)
- MIME allowlist: `['image/jpeg', 'image/png', 'image/webp']`
- Magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `52 49 46 46...57 45 42 50`
- Max file size: `5 * 1024 * 1024` (5 MB)
- Max pixels: `20_000_000` (decode bomb guard)
- Output dimensions: 256x256, fit `'cover'`, position `'centre'`
- Output format: webp, quality 80
- R2 key pattern: `avatars/{accountId}.webp`
- R2 object headers: `Content-Type: image/webp`, `Cache-Control: public, max-age=300`
- Rate limit: 1 per 60000 ms per user, keyed by `accountId`, module-global Map, cleared on restart
- Route: `POST /api/me/avatar`
- Multer field name: `avatar`, limits: `{ fileSize: 5 * 1024 * 1024, files: 1, fields: 0 }`
- Success shape: `{ avatarUrl: string }`
- Error codes: `'invalid_mime_type'`, `'file_too_large'`, `'rate_limited'`, `'upload_failed'`, `'unauthorized'`
- Origin validation: canonical per-user URL only (`https://images.barefootbetters.com/avatars/{accountId}.webp` where accountId = authenticated user)
- Sharp pipeline: `sharp(buffer, { limitInputPixels: 20_000_000 }).rotate().resize(256, 256, { fit: 'cover', position: 'centre' }).webp({ quality: 80 })`
- No `.withMetadata()` call (ensures EXIF/XMP/IPTC stripped)

## Guardrails
1. No `Math.random()` — rate-limit uses `Date.now()` (wall-clock is acceptable in server-layer non-gameplay code)
2. Do not trust multer `mimetype` — sniff buffer signature (magic bytes) before passing to `sharp`
3. Compensating delete is mandatory — R2 PUT success + DB UPDATE failure must DELETE the R2 object; if DELETE also fails, log and still return 500
4. EXIF strip: do NOT call `.withMetadata()`; `.rotate()` auto-orients and discards orientation EXIF
5. `validateAvatarUrl` checks canonical per-user URL (not just prefix) — must also accept `null` (clear avatar)
6. Multer `limits.fileSize` is the first line of defense (rejects before buffer enters app code)
7. Set decode safety limit (`limitInputPixels: 20_000_000`) — test with oversized-pixel image
8. No `.reduce()` in pipeline logic
9. Error messages are full sentences (code-style rule); all errors conform to D-11802 shape
10. `@koa/multer` and `sharp` are production dependencies, not devDependencies
11. Rate-limit tests MUST use fake timers (no wall-clock sleeps)

## Required `// why:` Comments
- `avatarUpload.logic.ts` rate-limit map: why in-memory is acceptable at MVP scale
- `avatarUpload.logic.ts` compensating delete: why delete-on-DB-failure rather than eventual GC
- `avatarUpload.logic.ts` `.rotate()`: why rotate is called (EXIF orientation strip, not visual rotation)
- `avatarUpload.logic.ts` R2 PUT `Cache-Control`: why short caching prevents stale avatars when overwriting stable key
- `ownerProfile.logic.ts` canonical per-user URL check: why per-user (not just prefix) prevents avatar impersonation (cite D-10601)

## Files to Produce
- `apps/server/src/profile/avatarUpload.logic.ts` — **new** — processing pipeline + R2 + DB + rate limit
- `apps/server/src/profile/avatarUpload.routes.ts` — **new** — Koa route handler + multer
- `apps/server/src/profile/avatarUpload.types.ts` — **new** — types + error codes
- `apps/server/src/profile/avatarUpload.logic.test.ts` — **new** — unit tests
- `apps/server/src/profile/ownerProfile.logic.ts` — **modified** — tighten validateAvatarUrl
- `apps/server/src/profile/ownerProfile.logic.test.ts` — **modified** — update validation tests
- `apps/server/src/server.mjs` — **modified** — wire registerAvatarUploadRoutes
- `apps/server/package.json` — **modified** — add sharp + @koa/multer
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — add POST /api/me/avatar row

## After Completing
- [ ] `pnpm --filter server build` exits 0
- [ ] `pnpm --filter server test` exits 0 (including new avatar tests)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/REFERENCE/api-endpoints.md` has `POST /api/me/avatar` row (Status: Wired)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `validateAvatarUrl` rejects non-canonical URLs AND another user's canonical URL

## Common Failure Smells
- Avatar updates succeed but UI shows old image → cache headers missing or `max-age` too long
- Spoofed MIME type bypasses validation → signature sniffing not wired before sharp
- Test hangs on rate-limit check → wall-clock sleep instead of fake timers
