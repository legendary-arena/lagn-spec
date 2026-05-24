# Session Prompt — WP-174: First-Sign-In Auto-Provisioning

**WP:** WP-174 — First-Sign-In Auto-Provisioning (Read-or-Create Account Resolver)
**EC:** EC-196
**Status:** Ready for execution (Phase 1 merged; pre-flight READY, copilot PASS, lint PASS)

## Invocation intent

Execute WP-174: make `productionAccountResolver` read-or-create so that
every valid Hanko-verified first sign-in automatically provisions a
`legendary.players` row, eliminating the 401 `unknown_account` gap that
D-16006 incorrectly claimed was already handled by WP-131.

## Authority chain (read order)

1. `.claude/CLAUDE.md`
2. `docs/ai/ARCHITECTURE.md` — §Layer Boundary (Server), §Persistence Boundaries
3. `.claude/rules/architecture.md` + `code-style.md` + `work-packets.md`
4. `docs/ai/work-packets/WP-174-first-signin-auto-provisioning.md`
5. `docs/ai/execution-checklists/EC-196-first-signin-auto-provisioning.checklist.md`
6. `docs/ai/REFERENCE/00.6-code-style.md`
7. `apps/server/src/auth/accountResolver.logic.ts`
8. `apps/server/src/auth/accountLookup.logic.ts`
9. `apps/server/src/auth/sessionToken.{types,logic}.ts`
10. `apps/server/src/auth/hanko/hankoVerifier.logic.ts`
11. `apps/server/src/identity/identity.{types,logic}.ts`
12. `data/migrations/004_create_players_table.sql`

## Pre-execution checks

- [ ] `origin/main` includes the WP-174 SPEC commit (this file's merge)
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` passes baseline
- [ ] Confirm locked files unchanged from main:
  - `apps/server/src/identity/identity.logic.ts`
  - `apps/server/src/identity/identity.types.ts`
  - `apps/server/src/auth/accountLookup.logic.ts`
  - `apps/server/src/auth/sessionToken.logic.ts`

## Execution rules

### Locked values (from EC-196)

- `VerifiedSessionClaim.email` → `readonly email?: string`
- `VerifiedSessionClaim.displayName` → `readonly displayName?: string`
- Migration file: `data/migrations/016_add_auth_provider_unique_constraint.sql`
- Index name: `players_auth_provider_sub_unique`
- ON CONFLICT target: `(auth_provider, auth_provider_id)`
- Display name fallback: `email.split('@')[0].slice(0, 64)`
- New helper: `apps/server/src/auth/accountProvisioning.logic.ts`

### Forbidden patterns

- DO NOT import `createPlayerAccount` in `accountResolver.logic.ts`
- DO NOT modify `identity.logic.ts`, `identity.types.ts`, `accountLookup.logic.ts`, or `sessionToken.logic.ts`
- DO NOT add new error codes to `SessionValidationErrorCode`
- DO NOT make `email` or `displayName` required on `VerifiedSessionClaim`
- DO NOT use SELECT-then-INSERT without ON CONFLICT (TOCTOU)

### 01.5 — Runtime wiring allowance

01.5 is NOT INVOKED. This WP touches only the server auth layer;
no engine surface is wired.

## Session task

1. Extend `VerifiedSessionClaim` in `sessionToken.types.ts` with two
   additive optional fields.
2. Extend `parsePayload` + the `verify` closure in `hankoVerifier.logic.ts`
   to extract `email` and `name` from the JWT payload and populate the
   new claim fields.
3. Create `accountProvisioning.logic.ts` with a `provisionPlayerAccount`
   helper that uses `INSERT ... ON CONFLICT (auth_provider, auth_provider_id)
   DO NOTHING RETURNING ...` + re-SELECT on conflict.
4. Modify `productionAccountResolver` to call `provisionPlayerAccount`
   on the no-match branch (when `claim.email` is defined).
5. Create migration `016_add_auth_provider_unique_constraint.sql`.
6. Write tests for the new provisioning helper and the updated resolver.
7. Update `api-endpoints.md` behavior text if needed.
8. Land D-17401..D-17406 (change status from "Drafted" to "Active").
9. Update WORK_INDEX.md (mark WP-174 Done) and EC_INDEX.md (EC-196 Done).

## Post-merge close ritual (REQUIRED)

After the operator merges the PR via the GitHub UI:

```pwsh
node scripts/prune-empty-claude-branch.mjs --verify-current
# Expected: VERIFY PASS
git branch -D claude/<execution-branch-name>
git push origin --delete claude/<execution-branch-name>
node scripts/prune-empty-claude-branch.mjs --report
# Expected: silent
```
