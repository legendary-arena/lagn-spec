# WP-106 — Avatar Upload Pipeline

## Goal

Ship a server-side avatar upload endpoint (`POST /api/me/avatar`) that accepts
image uploads, validates MIME type and size, strips EXIF metadata, resizes to
256x256 square webp, stores to R2 at `avatars/{accountId}.webp`, updates the
user's `avatar_url` in the database, and enforces a closed-origin allowlist on
`PATCH /api/me/profile` for `avatar_url` going forward.

## Assumes

- Prior packets complete: WP-104 (player profiles + `avatar_url` field), WP-112
  (session auth middleware), WP-126 (Hanko session verifier)
- `legendary.player_profiles` table exists with `avatar_url TEXT` column
- `requireAuthenticatedSession` middleware is wired and functional
- R2 bucket `legendary-images` is accessible via the existing `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME` env vars (same bucket
  used for card images)
- `apps/server/package.json` can accept new production dependencies (`sharp`,
  `@koa/multer`)

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary (Server layer responsibilities)
- `docs/ai/DECISIONS.md` — D-10601 (upload validation policy), D-10602 (endpoint
  contract), D-10405 (superseded for avatar_url), D-9905 (auth levels), D-11802
  (error contract shape)
- `.claude/rules/server.md` — server layer constraints
- `apps/server/src/profile/ownerProfile.logic.ts` — existing profile logic
- `apps/server/src/profile/ownerProfile.routes.ts` — existing route registration
- `apps/server/src/server.mjs` — route wiring location

## Scope (In)

- New `apps/server/src/profile/avatarUpload.logic.ts` — image validation,
  processing pipeline (EXIF strip, resize, webp conversion), R2 PUT, DB update,
  compensating delete on DB failure
- New `apps/server/src/profile/avatarUpload.routes.ts` — Koa route handler for
  `POST /api/me/avatar` with `@koa/multer` multipart parsing
- New `apps/server/src/profile/avatarUpload.types.ts` — `AvatarUploadResult`,
  `AvatarUploadErrorCode` types
- Modified `apps/server/src/profile/ownerProfile.logic.ts` — tighten
  `validateAvatarUrl` to closed-origin allowlist
  (`https://images.barefootbetters.com/avatars/*` only)
- Modified `apps/server/src/server.mjs` — wire `registerAvatarUploadRoutes`
- Modified `apps/server/package.json` — add `sharp`, `@koa/multer`
- Modified `docs/ai/REFERENCE/api-endpoints.md` — add `POST /api/me/avatar` row
- New `apps/server/src/profile/avatarUpload.logic.test.ts` — unit tests for
  validation, processing pipeline, rate limiting, error paths

## Out of Scope

- Client-side upload UI changes (separate WP if needed)
- Avatar deletion endpoint (future WP)
- Admin avatar moderation tools (WP-107 scope)
- Animated GIF / video support
- Multiple avatar sizes / responsive variants
- Migration file (no schema change needed — `avatar_url` column already exists)
- Changes to `player_links.url` validation (retains D-10405 open policy)

## Files Expected to Change

- `apps/server/src/profile/avatarUpload.logic.ts` — **new** — image processing
  pipeline + R2 upload + DB update + rate limiting
- `apps/server/src/profile/avatarUpload.routes.ts` — **new** — Koa route handler
  with multer middleware
- `apps/server/src/profile/avatarUpload.types.ts` — **new** — types and error
  codes
- `apps/server/src/profile/avatarUpload.logic.test.ts` — **new** — unit tests
- `apps/server/src/profile/ownerProfile.logic.ts` — **modified** — tighten
  `validateAvatarUrl` to R2-only allowlist
- `apps/server/src/profile/ownerProfile.logic.test.ts` — **modified** — update
  tests for tightened validation
- `apps/server/src/server.mjs` — **modified** — wire avatar upload route
- `apps/server/package.json` — **modified** — add `sharp`, `@koa/multer`
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — add endpoint row

## Contract

> **Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no snippets)
> - List of exact commands to run with expected output
> - ESM only, Node v22+
> - Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
> - No `Math.random()`, no `.reduce()` in pipeline logic
> - All error messages are full sentences per code-style rule

## Non-Negotiable Constraints

### Upload Validation (D-10601)

- MIME allowlist: `['image/jpeg', 'image/png', 'image/webp']` (closed set)
- Max file size: `5 * 1024 * 1024` bytes (5 MB)
- EXIF/XMP/IPTC metadata stripped before storage
- Output: 256x256 center-crop, webp quality 80
- R2 key: `avatars/{accountId}.webp`
- Rate limit: 1 upload per 60 seconds per user (in-memory)

### Endpoint Contract (D-10602)

- Route: `POST /api/me/avatar`
- Auth: `authenticated-session-required`
- Content-Type: `multipart/form-data`, field name `avatar`
- Success: `200 { avatarUrl: string }`
- Errors: `400 invalid_mime_type`, `400 file_too_large`,
  `429 rate_limited`, `500 upload_failed`, `401 unauthorized`
- Compensating delete: if DB UPDATE fails after R2 PUT, delete the R2 object

### Origin Policy (supersedes D-10405 for `avatar_url`)

- `validateAvatarUrl` accepts ONLY URLs matching:
  `https://images.barefootbetters.com/avatars/` prefix
- `null` (clear avatar) remains accepted
- All other URLs rejected with `code: 'invalid_avatar_url'`

### Processing Pipeline Order

1. Validate MIME type (reject early, no processing)
2. Check rate limit (reject early, no processing)
3. Read buffer from multer
4. `sharp(buffer).rotate().resize(256, 256, { fit: 'cover', position: 'centre' }).webp({ quality: 80 }).toBuffer()`
5. PUT to R2
6. UPDATE `legendary.player_profiles` SET `avatar_url` WHERE `account_id`
7. On DB failure: DELETE from R2 (compensating action)
8. Return `{ avatarUrl }` on success

## Acceptance Criteria

- [ ] `POST /api/me/avatar` with a valid jpeg returns `200 { avatarUrl: "https://images.barefootbetters.com/avatars/{accountId}.webp" }`
- [ ] Upload with `image/gif` MIME type returns `400 { code: 'invalid_mime_type' }`
- [ ] Upload exceeding 5 MB returns `400 { code: 'file_too_large' }`
- [ ] Second upload within 60 seconds returns `429 { code: 'rate_limited' }`
- [ ] `PATCH /api/me/profile` with `avatar_url: "https://example.com/pic.jpg"` returns `400 { code: 'invalid_avatar_url' }`
- [ ] `PATCH /api/me/profile` with `avatar_url: null` succeeds (clears avatar)
- [ ] `PATCH /api/me/profile` with `avatar_url: "https://images.barefootbetters.com/avatars/abc123.webp"` succeeds
- [ ] R2 object is deleted if DB update fails (compensating action tested)
- [ ] `api-endpoints.md` contains the new `POST /api/me/avatar` row with correct schema
- [ ] `pnpm --filter server test` passes with new tests covering all error codes

## Verification Steps

```pwsh
pnpm --filter server test
# Expected: all passing (including new avatar upload tests)
```

```pwsh
node -e "import('sharp').then(s => console.log('sharp OK', s.default.versions))"
# Expected: sharp OK { ... vips: '8.x.x' ... }
```

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` — D-10601, D-10602 already landed (this drafting session)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-106 checked off with date
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated with new endpoint row
- [ ] No files outside the "Files Expected to Change" list were modified

## Decision Points

- D-10601: Upload validation policy (locked at draft, 2026-05-16)
- D-10602: Endpoint contract (locked at draft, 2026-05-16)

## Failure Conditions

- Any upload bypasses MIME validation (security failure)
- EXIF data persists in stored webp (privacy failure)
- Orphaned R2 objects accumulate on DB failure (compensating delete missing)
- `avatar_url` accepts non-R2 URLs after WP-106 ships (origin policy not enforced)
- Rate limit state leaks between users or resets on unrelated requests
