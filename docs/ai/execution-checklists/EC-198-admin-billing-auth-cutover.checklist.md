# EC-198 — Admin Billing Auth Cutover (WP-176)

**WP:** WP-176 — Admin Billing Auth Cutover (requireAdminSecret → requireAdminSession)
**Layer:** Server (`apps/server/`)
**Status:** Pending

---

## Before Starting

- [ ] WP-110 ✅, WP-159 ✅, WP-107 ✅, WP-112 ✅, WP-126 ✅, WP-131 ✅, WP-174 ✅
- [ ] `apps/server/src/auth/adminSession.ts` exports `requireAdminSession`
- [ ] `apps/server/src/server.mjs` has `requireAdminSession` import + `verifier` + `productionAccountResolver` in scope
- [ ] Server test baseline: ≥441 pass / 1 fail / ≥66 skip (`pnpm test --filter @legendary-arena/server`)
- [ ] `pnpm -r build` exits 0

---

## Locked Values

- Route path: `GET /api/admin/billing/history`
- `Cache-Control: no-store` first statement (D-11504)
- 200 body: `{ entries: AdminBillingEntry[] }`
- 500 body: `{ error: 'internal_error' }`
- Auth failure body: `{ code: 'unauthorized' | 'forbidden', reason: string }`
- `lookup_failed` → 500 `{ code: 'internal_error' }` (not surfaced distinctly)
- Status-code domain: `{200, 401, 403, 500}`
- Deps interface: `{ requireAdminSession, verifier?, accountResolver? }`
- server.mjs three-arg call: byte-identical deps bundle to `registerAdminProfileRoutes`

---

## Guardrails

1. `adminBilling.logic.ts` is NOT modified (query layer untouched)
2. `adminBilling.types.ts` is NOT modified (response contract untouched)
3. `adminSession.ts` is NOT modified (gate consumed, not changed)
4. `sessionToken.{logic,types}.ts` are NOT modified
5. `auth/hanko/**` is NOT modified
6. No new npm dependencies
7. `adminGate.ts` + `adminGate.test.ts` deleted — grep `requireAdminSecret` = 0 hits post-commit
8. No `process.env.ADMIN_SECRET` in any test file post-rewrite

---

## Required Comments

- `// why:` on `Cache-Control: no-store` (D-11504 lock; carry forward from WP-110)
- `// why:` on `requireAdminSession` first-statement-after-cache-control (WP-176 cutover; D-17601)
- `// why:` on server.mjs wiring comment (WP-176 / D-17601 cutover replacing D-11001)

---

## Files to Produce

1. `apps/server/src/billing/adminBilling.routes.ts` — modified (§A)
2. `apps/server/src/billing/adminBilling.routes.test.ts` — modified (§B)
3. `apps/server/src/server.mjs` — modified (§C)
4. `apps/server/src/auth/adminGate.ts` — deleted (§D)
5. `apps/server/src/auth/adminGate.test.ts` — deleted (§D)
6. `docs/ai/REFERENCE/api-endpoints.md` — modified (§E)
7. `docs/ai/DECISIONS.md` — modified (§F)
8. `docs/ai/work-packets/WORK_INDEX.md` — modified

---

## After Completing

- [ ] D-17601, D-17602, D-17603 flipped from "reserved" to "Active"
- [ ] WP-176 checked off in WORK_INDEX.md
- [ ] EC-198 status flipped to Done in EC_INDEX.md
- [ ] `api-endpoints.md` Auth Taxonomy reduced from 5 to 4 values
- [ ] `api-endpoints.md` changelog entry added
- [ ] Post-merge operator action: delete `ADMIN_SECRET` env var on Render

---

## Common Failure Smells

- Forgetting to widen `KoaAdminBillingContext.req` from `IncomingMessage` to `SessionTokenRequest`
- Forgetting to pass `database` into the `requireAdminSession` options (it needs the pool for the `is_admin` check)
- Leaving a stale `import { requireAdminSecret }` that still compiles because the file exists
- Writing `{ code: result.code }` without `reason: result.reason` on the failure path
- Partial taxonomy edit (changing the row but leaving the taxonomy table at 5 values)
