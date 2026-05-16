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
- Max file size: `5 * 1024 * 1024` (5 MB)
- Output dimensions: 256x256, fit `'cover'`, position `'centre'`
- Output format: webp, quality 80
- R2 key pattern: `avatars/{accountId}.webp`
- Rate limit: 1 per 60000 ms per user
- Route: `POST /api/me/avatar`
- Multer field name: `avatar`
- Success shape: `{ avatarUrl: string }`
- Error codes: `'invalid_mime_type'`, `'file_too_large'`, `'rate_limited'`, `'upload_failed'`, `'unauthorized'`
- Origin allowlist prefix: `https://images.barefootbetters.com/avatars/`
- Sharp pipeline: `.rotate().resize(256, 256, { fit: 'cover', position: 'centre' }).webp({ quality: 80 })`

## Guardrails
1. No `Math.random()` — rate-limit uses `Date.now()` (wall-clock is acceptable in server-layer non-gameplay code)
2. Compensating delete is mandatory — R2 PUT success + DB UPDATE failure must DELETE the R2 object
3. EXIF strip happens via sharp `.rotate()` (auto-orient strips orientation EXIF) + metadata is not preserved (sharp default)
4. `validateAvatarUrl` closed-origin check must also accept `null` (clear avatar)
5. Multer `limits.fileSize` is the first line of defense (rejects before buffer enters app code)
6. No `.reduce()` in pipeline logic
7. Error messages are full sentences (code-style rule)
8. `@koa/multer` and `sharp` are production dependencies, not devDependencies

## Required `// why:` Comments
- `avatarUpload.logic.ts` rate-limit map: why in-memory is acceptable at MVP scale
- `avatarUpload.logic.ts` compensating delete: why delete-on-DB-failure rather than eventual GC
- `avatarUpload.logic.ts` `.rotate()`: why rotate is called (EXIF orientation strip, not visual rotation)
- `ownerProfile.logic.ts` closed-origin check: why D-10405 is superseded (cite D-10601)

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
- [ ] `validateAvatarUrl` rejects `https://example.com/pic.jpg` (grep confirms closed-origin)
