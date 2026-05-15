# WP-152 — Wire Public Profile Route in server.mjs

**Status:** Ready for execution
**Primary Layer:** Server (wiring only)
**Dependencies:** WP-102 ✅, WP-115 ✅
**Closes:** D-10202 (route deferral), D-11505 (reaffirmation)

---

## Goal

Call `registerProfileRoutes(server.router, pool)` in `server.mjs` so
`GET /api/players/:handle/profile` serves live traffic. Graduate the
catalog row from `Shipped-but-unwired` to `Wired`.

This is the ~10-line packet that D-11505 reserved.

---

## Assumes

- `registerProfileRoutes` is exported from
  `apps/server/src/profile/profile.routes.ts` (landed in WP-102).
- `registerProfileRoutes` signature is
  `(router: KoaRouter, database: DatabaseClient)` — matches the
  invocation pattern used by `registerOwnerProfileRoutes`.
- The same `router` instance (`server.router`) used by owner profile
  routes must be used for public profile routes.
- The long-lived `pg.Pool` exists in `server.mjs` (landed in WP-115).
- No auth deps — the route is explicitly `guest` per WP-102 and must
  not be wrapped in authentication middleware or guards.

If any assumption is false, **STOP**.

---

## Scope (In)

### A) server.mjs — add the call site

**File:** `apps/server/src/server.mjs` — **modified**

Add `registerProfileRoutes(server.router, pool)` immediately after the
existing `registerOwnerProfileRoutes(...)` call within the route
registration section of `server.mjs`. Include a `// why:` comment
citing WP-152, D-10202, and D-11505.

Add the corresponding import of `registerProfileRoutes` from
`./profile/profile.routes.js` at the top of the file.

No auth injection — the route is explicitly `guest` per WP-102 and must
not be wrapped in authentication middleware or guards.

Import uses `.js` extension (ESM runtime requirement; Node does not
resolve `.ts`).

**Non-negotiable constraints on the call site:**

- `registerProfileRoutes` must be invoked exactly once (no duplicate
  registration)
- No middleware or wrapper may be applied to `server.router` between
  `registerOwnerProfileRoutes(...)` and `registerProfileRoutes(...)`
- Route registration order must not be altered in a way that changes
  behavior of existing routes (including owner profile routes)
- The handler behavior, response shape, and status codes defined in
  WP-102 must remain byte-for-byte unchanged — zero-byte diff in
  `profile.routes.ts`, `profile.logic.ts`, and `profile.types.ts`

### B) API catalog graduation

**File:** `docs/ai/REFERENCE/api-endpoints.md` — **modified**

Replace the `GET /api/players/:handle/profile` row:
- Status: `Shipped-but-unwired` → `Wired`
- Authorizing WP: append `WP-152`
- Notes: remove the deferral language; note that the route is live

### C) Decisions update

**File:** `docs/ai/DECISIONS.md` — **modified**

- D-10202: mark `Status: Resolved at WP-152 close`
- D-11505: mark `Status: Resolved at WP-152 close`
- Add D-15201 (if ID collides with existing entry, use next available):
  "WP-152 wires `registerProfileRoutes` in `server.mjs`, closing the
  D-10202 deferral. No auth injection; route is `guest`."

### D) WORK_INDEX update

**File:** `docs/ai/work-packets/WORK_INDEX.md` — **modified**

Add WP-152 line in the appropriate phase section.

---

## Out of Scope

- Any changes to `profile.routes.ts`, `profile.logic.ts`, or
  `profile.types.ts` — the handler behavior, response shape, and status
  codes defined in WP-102 must remain byte-for-byte unchanged
- Cache headers, rate limiting, or middleware additions
- Client-side changes (already built)
- The "Community Funding" panel idea from the rejected WP-109 draft

---

## Files Expected to Change (Allowlist)

- `apps/server/src/server.mjs` — **modified**
- `docs/ai/REFERENCE/api-endpoints.md` — **modified**
- `docs/ai/DECISIONS.md` — **modified**
- `docs/ai/work-packets/WORK_INDEX.md` — **modified**

No other files may be modified.

---

## Acceptance Criteria (Binary Pass/Fail)

- [ ] `registerProfileRoutes(server.router, pool)` is called exactly once in `server.mjs`
- [ ] Import of `registerProfileRoutes` present at top of `server.mjs`
- [ ] No auth middleware wrapping the call site
- [ ] WP-102 handler code (`profile.routes.ts`, `profile.logic.ts`, `profile.types.ts`) unchanged
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` exits 0
- [ ] `api-endpoints.md` row shows `Wired` for `GET /api/players/:handle/profile`
- [ ] D-10202 and D-11505 marked Resolved in DECISIONS.md
- [ ] D-15201 added (if ID collides, use next available)
- [ ] `git diff --name-only` contains only allowlisted files

---

## Verification

```pwsh
pnpm -r build && pnpm test

# Confirm exactly one invocation (not import, not comments)
Select-String -Path "apps\server\src\server.mjs" -Pattern "registerProfileRoutes\s*\("
# Expected: exactly 1 match

# Confirm import exists
Select-String -Path "apps\server\src\server.mjs" -Pattern "import.*registerProfileRoutes"
# Expected: exactly 1 match

# Confirm catalog graduation
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "Wired.*players.*handle.*profile"
# Expected: exactly 1 match

# Confirm WP-102 handler unchanged (zero-byte diff)
git diff HEAD -- apps/server/src/profile/profile.routes.ts apps/server/src/profile/profile.logic.ts apps/server/src/profile/profile.types.ts
# Expected: no output (zero changes)

# Runtime check (server must be running)
# curl http://localhost:3000/api/players/test-handle/profile
# Expected: 200 with JSON profile if handle exists,
# or existing not_found behavior from WP-102 (do not reinterpret)
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] Build + tests green
- [ ] WORK_INDEX updated
- [ ] 01.5 NOT INVOKED (no engine surface change)
