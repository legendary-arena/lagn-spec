# EC-159 — Wire Public Profile Route (Execution Checklist)

> **EC slot retarget:** Natural slot EC-152 collides with WP-150's
> leaderboard EC; EC-158 collides with WP-108's billing EC. Retargeted
> to EC-159 (next free slot) per the locked numbering rule in EC_INDEX.md.

**Source:** docs/ai/work-packets/WP-152-wire-public-profile-route.md
**Layer:** Server (wiring only)

## Before Starting
- [ ] WP-102 complete (profile handler exported)
- [ ] WP-115 complete (long-lived `pg.Pool` in `server.mjs`)
- [ ] `registerProfileRoutes` exists in `apps/server/src/profile/profile.routes.ts`
- [ ] Signature is `(router: KoaRouter, database: DatabaseClient)` — no auth params
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` exits 0

## Locked Values (do not re-derive)
- Call: `registerProfileRoutes(server.router, pool)`
- Placement: immediately after the `registerOwnerProfileRoutes(...)` call
- Import path: `./profile/profile.routes.js` (`.js` extension — ESM requirement; Node does not resolve `.ts`)
- Route is `guest` — zero auth middleware or guards
- Endpoint: `GET /api/players/:handle/profile` (defined by WP-102, not this WP)
- Catalog graduation: `Shipped-but-unwired` → `Wired`
- Decisions to close: D-10202, D-11505
- New decision: D-15201 (use next available if collides)

## Guardrails
- `registerProfileRoutes` invoked exactly once — no duplicate registration
- No middleware or wrapper applied to `server.router` between `registerOwnerProfileRoutes(...)` and the new call
- Route registration order must not alter behavior of existing routes
- WP-102 handler files zero-byte diff: `profile.routes.ts`, `profile.logic.ts`, `profile.types.ts`
- No auth injection — do not pass `requireAuthenticatedSession`, `verifier`, or `accountResolver`
- No changes to response shape, status codes, or handler behavior
- Only 4 files in allowlist — `server.mjs`, `api-endpoints.md`, `DECISIONS.md`, `WORK_INDEX.md`

## Required `// why:` Comments
- `server.mjs` call site: cite WP-152, D-10202 (original deferral), D-11505 (reaffirmation)

## Files to Produce
- `apps/server/src/server.mjs` — **modified** — add import + one call site
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — graduate row to `Wired`
- `docs/ai/DECISIONS.md` — **modified** — resolve D-10202, D-11505; add D-15201
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — add WP-152 line

## After Completing
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` exits 0
- [ ] `Select-String` on `server.mjs` for `registerProfileRoutes\s*\(` shows exactly 1 match (invocation)
- [ ] `Select-String` on `server.mjs` for `import.*registerProfileRoutes` shows exactly 1 match (import)
- [ ] `git diff HEAD -- apps/server/src/profile/profile.routes.ts apps/server/src/profile/profile.logic.ts apps/server/src/profile/profile.types.ts` shows zero changes
- [ ] `api-endpoints.md` row shows `Wired` for the public profile endpoint
- [ ] D-10202 and D-11505 marked Resolved in `DECISIONS.md`
- [ ] `WORK_INDEX.md` updated
- [ ] `git diff --name-only` contains only the 4 allowlisted files
- [ ] 01.5 NOT INVOKED

## Common Failure Smells
- 2+ invocation matches for the registration function in `server.mjs` → duplicate registration
- Auth-related params (`verifier`, `accountResolver`) in the call → wrong invocation pattern; this route is `guest`
- Any diff in `profile.routes.ts` / `profile.logic.ts` / `profile.types.ts` → WP-102 contract violation
- Import path ending `.ts` instead of `.js` → ESM resolution failure at runtime
