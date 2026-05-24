# EC-196 — First-Sign-In Auto-Provisioning (Execution Checklist)

**Source:** docs/ai/work-packets/WP-174-first-signin-auto-provisioning.md
**Layer:** Server

## Before Starting
- [ ] `origin/main` includes WP-107 (migration 015 `is_suspended` column) — `dbd0ecc` or later
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` passes baseline
- [ ] Read `accountResolver.logic.ts` — confirm the null branch at line 91-93
- [ ] Read `hankoVerifier.logic.ts` — confirm `parsePayload` does NOT extract email today
- [ ] Read `identity.logic.ts` — confirm `createPlayerAccount` signature and `duplicate_email` code

## Locked Values (do not re-derive)
- `VerifiedSessionClaim.email` — `readonly email?: string`
- `VerifiedSessionClaim.displayName` — `readonly displayName?: string`
- Migration file: `data/migrations/016_add_auth_provider_unique_constraint.sql`
- Index name: `players_auth_provider_sub_unique`
- ON CONFLICT target: `(auth_provider, auth_provider_id)`
- Email validation gate: defined + non-empty after trim + contains `'@'`
- Email canonicalization: `claim.email.trim().toLowerCase()` BEFORE use
- Display name fallback: `normalizedEmail.split('@')[0].slice(0, 64)`
- Display name from claim: `claim.displayName.trim().slice(0, 64)` (only if non-empty after trim)
- Display name max: 64 characters
- Provisioning is a SINGLE INSERT statement (atomic, no multi-step)
- Idempotency: same `(auth_provider, auth_provider_id)` → same `accountId` always
- New helper file: `apps/server/src/auth/accountProvisioning.logic.ts`
- D-entries: D-17401 through D-17406

## Guardrails
- `identity.logic.ts` is LOCKED — zero modifications
- `identity.types.ts` is LOCKED — zero modifications
- `accountLookup.logic.ts` is LOCKED — zero modifications
- `sessionToken.logic.ts` is LOCKED — zero modifications
- DO NOT import `createPlayerAccount` in `accountResolver.logic.ts`
- The resolver NEVER throws — all paths return `Result`
- `VerifiedSessionClaim` fields are OPTIONAL (not `| undefined`) — existing consumers compile unchanged
- No new error codes in `SessionValidationErrorCode`

## Required Comments
- `// why:` on the email extraction in `hankoVerifier.logic.ts` (best-effort enrichment, not verification failure)
- `// why:` on the ON CONFLICT clause in `accountProvisioning.logic.ts` (race-safety + idempotency)
- `// why:` on the `duplicate_email` branch in `accountResolver.logic.ts` (account-linking intentionally deferred — identity ambiguity)
- `// why:` on the display-name fallback derivation (normalize email + deterministic derivation)
- `// why:` on the email validation gate (`@` check — reject garbage without full validation)
- `// why:` on the `console.info` provisioning log (observability for onboarding debugging)

## Files to Produce
- `apps/server/src/auth/sessionToken.types.ts` — modify (2 optional fields)
- `apps/server/src/auth/hanko/hankoVerifier.logic.ts` — modify (extract email + name)
- `apps/server/src/auth/accountResolver.logic.ts` — modify (read-or-create branch)
- `apps/server/src/auth/accountProvisioning.logic.ts` — **new** (ON CONFLICT helper)
- `apps/server/src/auth/accountProvisioning.logic.test.ts` — **new**
- `apps/server/src/auth/accountResolver.logic.test.ts` — **new** or modify
- `apps/server/src/auth/hanko/hankoVerifier.logic.test.ts` — modify
- `data/migrations/016_add_auth_provider_unique_constraint.sql` — **new**
- `docs/ai/REFERENCE/api-endpoints.md` — modify (behavior text)
- `docs/ai/DECISIONS.md` — modify (D-17401..D-17406 + D-16006 supersession)
- `docs/ai/work-packets/WORK_INDEX.md` — modify

## After Completing
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` passes (baseline + new tests)
- [ ] `grep -c "createPlayerAccount" apps/server/src/auth/accountResolver.logic.ts` → 0
- [ ] `git diff HEAD -- apps/server/src/identity/identity.logic.ts` → empty
- [ ] `git diff HEAD -- apps/server/src/identity/identity.types.ts` → empty
- [ ] `git diff HEAD -- apps/server/src/auth/accountLookup.logic.ts` → empty
- [ ] `git diff HEAD -- apps/server/src/auth/sessionToken.logic.ts` → empty
- [ ] DECISIONS.md: D-17401..D-17406 status = Active; D-16006 status = Superseded
- [ ] WORK_INDEX.md: WP-174 row = `[x]`
- [ ] EC_INDEX.md: EC-196 status = Done
- [ ] api-endpoints.md behavior text updated

## Common Failure Smells
- Importing `createPlayerAccount` directly — use the new `provisionPlayerAccount` helper instead
- Adding a `'provisioning_failed'` code to `SessionValidationErrorCode` — map to `'lookup_failed'` instead
- Making `email` or `displayName` required on `VerifiedSessionClaim` — breaks all existing test fakes
- Modifying `accountLookup.logic.ts` to add INSERT logic — wrong file; the lookup is read-only by design
- Using SELECT-then-INSERT without ON CONFLICT — TOCTOU race under concurrent first calls
- Skipping the `@` check on email — allows garbage like `" "` to attempt an INSERT that will fail at DB level
- Using `claim.email` without `.trim().toLowerCase()` first — creates inconsistent DB rows
- Multi-statement provisioning (BEGIN/INSERT/UPDATE/COMMIT) — violates atomicity; single INSERT only
- Missing the "no row created" assertion in missing-email tests — silent partial provisioning
