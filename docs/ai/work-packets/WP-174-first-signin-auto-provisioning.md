# WP-174 — First-Sign-In Auto-Provisioning (Read-or-Create Account Resolver)

## Goal

When a user authenticates via Hanko for the first time (no existing
`legendary.players` row), the server automatically provisions a new
account row using the verified JWT claims. After WP-174 lands, every
valid Hanko-verified token that includes a parseable email claim
resolves to an `AccountId` — the `'unknown_account'` 401 response
becomes structurally unreachable for valid tokens carrying an email,
and the manual-INSERT workaround applied during WP-107 PS-1
(2026-05-24) is never needed again.

## Assumes

- WP-052 `createPlayerAccount` + `Result<PlayerAccount>` — Done ✅
- WP-112 `AccountResolver` interface + `findAccountByAuthProviderSub` — Done ✅
- WP-126 Hanko verifier (`createHankoSessionVerifier`) — Done ✅
- WP-131 production wiring (`productionAccountResolver`) — Done ✅
- WP-160 Hanko client UI (signs in users, produces bearer tokens) — Done ✅
- Migration 004 `legendary.players` table exists on production
- `origin/main` @ `dbd0ecc` (2026-05-24)

## Context (Read First)

D-16006 (Active, WP-160) asserts: "WP-131 already provisions accounts
on first authenticated call." This is empirically false. The production
account resolver (`accountResolver.logic.ts`) is read-only — it calls
`findAccountByAuthProviderSub`, receives `Result.ok(null)` on no-match,
and forwards the null to the orchestrator which emits
`'unknown_account'`. No code path calls `createPlayerAccount` outside
of tests.

The gap was surfaced during WP-107 PS-1 production verification
(2026-05-24): jeff@barefootbetters.com signed in via Hanko, loaded
`?route=me`, and hit the error banner "Your account could not be
located." Workaround: manual `INSERT INTO legendary.players` via psql.

This WP corrects the gap by making `productionAccountResolver`
read-or-create: on no-match, it invokes `createPlayerAccount` using
claims extracted from the Hanko JWT. This requires extending
`VerifiedSessionClaim` with the email claim the Hanko JWT carries
(per the OIDC standard).

**Read order:**
1. `.claude/CLAUDE.md`
2. `docs/ai/ARCHITECTURE.md` — §Layer Boundary, §Persistence Boundaries
3. `.claude/rules/architecture.md` + `code-style.md` + `work-packets.md`
4. `apps/server/src/auth/accountResolver.logic.ts` (the file to change)
5. `apps/server/src/auth/accountLookup.logic.ts`
6. `apps/server/src/auth/sessionToken.{types,logic}.ts`
7. `apps/server/src/auth/hanko/hankoVerifier.logic.ts`
8. `apps/server/src/identity/identity.{types,logic}.ts`
9. `data/migrations/004_create_players_table.sql`

## Scope (In)

### §A — Extend `VerifiedSessionClaim` (additive optional fields)

Add two additive optional fields to `VerifiedSessionClaim` in
`sessionToken.types.ts`:

```ts
export interface VerifiedSessionClaim {
  readonly authProvider: AuthProvider;
  readonly authProviderSub: string;
  readonly expiresAt: string;
  readonly email?: string;          // NEW — Hanko JWT `email` claim
  readonly displayName?: string;    // NEW — Hanko JWT `name` claim (absent for most tenants)
}
```

Both fields are `optional` (not `undefined`) so existing verifier
implementations and test fakes continue to compile without changes.
The Hanko verifier populates them; a future replacement broker
populates whatever it carries.

### §B — Extract `email` and `name` from Hanko JWT payload

In `hankoVerifier.logic.ts`, extend `parsePayload` to read the `email`
and `name` top-level claims from the JWT payload. Hanko's session JWT
carries:

```json
{
  "sub": "ffb638f1-...",
  "aud": ["https://play.legendary-arena.com"],
  "exp": 1748123456,
  "amr": ["pwd"],
  "email": { "address": "jeff@barefootbetters.com", "is_primary": true, "is_verified": true }
}
```

**Or** (depending on Hanko version):
```json
{ "email": "jeff@barefootbetters.com" }
```

The extraction must handle both shapes:
- If `email` is a string → use it directly.
- If `email` is an object with `.address` string → use `.address`.
- If `email` is absent or unparseable → `undefined` (no failure).

For `name` / `display_name`:
- If `name` is a non-empty string → use it.
- Otherwise → `undefined`.

Neither missing field causes verification to fail. They are
best-effort enrichment for provisioning.

### §C — Make `productionAccountResolver` read-or-create

**Resolver Contract (Post-WP-174):**
- The resolver remains the single entry point for mapping a verified claim → AccountId.
- It MUST attempt lookup first.
- It MAY attempt provisioning only when:
  - No account exists (lookup returned `null`)
  - AND sufficient identity data (email with `@`) is present in the claim
- It MUST remain idempotent and side-effect-safe under concurrent calls.
- It NEVER throws. All failure paths return typed `Result`.

In `accountResolver.logic.ts`, the no-match branch (`lookupResult.value === null`)
currently returns `{ ok: true, value: null }`. Change to:

1. Check `claim.email` is defined, non-empty after trim, and contains `'@'`.
   - If absent, empty, whitespace-only, or missing `@` → return
     `{ ok: true, value: null }` (preserves existing behavior; the
     orchestrator emits `'unknown_account'`). No row is created.
2. Normalize and derive `displayName`:
   ```ts
   const normalizedEmail = claim.email.trim().toLowerCase();
   const displayName =
     claim.displayName && claim.displayName.trim().length > 0
       ? claim.displayName.trim().slice(0, 64)
       : normalizedEmail.split('@')[0].slice(0, 64);
   // why: normalize email + enforce deterministic display name derivation
   ```
   Email is always canonicalized (trim + lowercase) before use as both
   the insert value and the fallback-name source.
3. Call `createPlayerAccount({ email: claim.email, displayName,
   authProvider: claim.authProvider, authProviderId: claim.authProviderSub },
   database)`.
4. On success → log the provisioning event for observability:
   ```ts
   // why: observability for first-sign-in provisioning events —
   // the only diagnostic available for debugging onboarding issues
   // without inspecting DB rows directly
   console.info('[accountResolver] Provisioned new player account', {
     authProvider: claim.authProvider,
     accountId: newAccount.accountId,
   });
   ```
   Then return `{ ok: true, value: newAccount.accountId }`.
5. On `'duplicate_email'` → the email is already taken by a different
   auth provider. Return `{ ok: true, value: null }` (fail open to
   `'unknown_account'`). Automatic account linking is intentionally NOT
   performed here to avoid identity ambiguity — a separate
   account-linking WP is required to resolve cross-provider collisions.
6. On any other failure → forward as `Result.fail({ code: 'lookup_failed' })`.

### §D — Migration: UNIQUE constraint on (auth_provider, auth_provider_id)

New migration `016_add_auth_provider_unique_constraint.sql`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS players_auth_provider_sub_unique
  ON legendary.players (auth_provider, auth_provider_id);
```

This eliminates the TOCTOU race between SELECT and INSERT. Combined
with `ON CONFLICT` in the INSERT (§E below), concurrent first calls
resolve deterministically.

**Rollback note:** Safe to leave index in place on rollback; it enforces
a correctness invariant that is independently valid regardless of
whether the provisioning code is deployed. No `DROP INDEX` required
during rollback paths.

### §E — Race-safe INSERT with ON CONFLICT

Amend `createPlayerAccount` OR add a dedicated
`findOrCreatePlayerAccount` helper that uses:

```sql
INSERT INTO legendary.players (ext_id, email, display_name, auth_provider, auth_provider_id)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (auth_provider, auth_provider_id) DO NOTHING
RETURNING ext_id, email, display_name, auth_provider, auth_provider_id, created_at, updated_at
```

If `RETURNING` yields no rows (conflict), immediately re-SELECT
by `(auth_provider, auth_provider_id)` to fetch the winning row.

**Idempotency guarantee:**
For a given `(auth_provider, auth_provider_id)` pair:
- Multiple concurrent or repeated provisioning attempts MUST resolve to
  a single row.
- The function MUST always return the same `accountId` after the first
  successful insert.

**Atomicity requirement:**
Provisioning MUST never leave a partially created row. The INSERT is the
only write operation; no multi-step creation sequence is allowed. A
single SQL statement is the entire write surface.

**Design choice:** add a NEW `provisionPlayerAccount` helper in
`accountResolver.logic.ts` (or a dedicated `accountProvisioning.logic.ts`)
rather than modifying the locked `createPlayerAccount` in
`identity.logic.ts`. `createPlayerAccount` remains unchanged (it's a
WP-052 contract file). The new helper composes `INSERT ... ON CONFLICT`
in a single statement — no application-level SELECT-then-INSERT.

### §F — Supersede D-16006 in DECISIONS.md

Add D-17401 to DECISIONS.md marking D-16006 as **Superseded** and
documenting the correct implementation shape. Update D-16006's status
to `Superseded by D-17401`.

## Out of Scope

- **Account linking** (same email, different auth provider). If a user
  registers with email+password then later signs in via Google using
  the same email, the second attempt hits the `duplicate_email` branch
  and returns `'unknown_account'`. A separate account-linking WP is
  needed. This WP deliberately does NOT attempt auto-linking.
- **Modifying `createPlayerAccount` in `identity.logic.ts`** (WP-052
  contract file; locked).
- **HANKO_JWKS_REFRESH_INTERVAL_MS numeric parse issue** on production
  Render (deploy log shows "refresh=NaNms"). Pre-existing config
  issue; not this WP's scope.
- **Lobby sign-in link UX** (users must type `?route=login` manually).
  Pre-existing UX gap; separate WP.
- **`accountId` population in the Pinia auth store.** D-16006's
  "accountId lag" note stands; no client-side change in this WP.
- **Modifying `accountLookup.logic.ts`** (WP-112 contract file;
  locked). The SELECT-only helper remains unchanged.
- **Email verification enforcement** — see §Locked Policies below.
  Unverified emails are accepted; Hanko is the trust boundary.

## Files Expected to Change

| File | Action |
|------|--------|
| `apps/server/src/auth/sessionToken.types.ts` | Modify — add optional fields to `VerifiedSessionClaim` |
| `apps/server/src/auth/hanko/hankoVerifier.logic.ts` | Modify — extract email + name from JWT payload |
| `apps/server/src/auth/accountResolver.logic.ts` | Modify — read-or-create logic |
| `apps/server/src/auth/accountProvisioning.logic.ts` | **New** — `provisionPlayerAccount` helper (ON CONFLICT + re-SELECT) |
| `apps/server/src/auth/accountProvisioning.logic.test.ts` | **New** — unit tests |
| `apps/server/src/auth/accountResolver.logic.test.ts` | **New** or modify — test the read-or-create flow |
| `apps/server/src/auth/hanko/hankoVerifier.logic.test.ts` | Modify — test email/name extraction |
| `data/migrations/016_add_auth_provider_unique_constraint.sql` | **New** — UNIQUE index |
| `docs/ai/REFERENCE/api-endpoints.md` | Modify — update behavior text for authenticated routes |
| `docs/ai/DECISIONS.md` | Modify — land D-17401..D-17406, supersede D-16006 |
| `docs/ai/work-packets/WORK_INDEX.md` | Modify — mark WP-174 done |

## Non-Negotiable Constraints

### Engine-wide

- Full file contents for every new or modified file — no diffs, no snippets.
- ESM only, Node v22+.
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`.
- Every function has a JSDoc comment.
- Every `async` function doing I/O handles errors explicitly with try/catch.
- Error messages are full sentences (what failed + what to check).
- No `.reduce()` in data operations.

### Packet-specific

- `identity.logic.ts` and `identity.types.ts` are LOCKED — DO NOT MODIFY.
- `accountLookup.logic.ts` is LOCKED — DO NOT MODIFY.
- `sessionToken.logic.ts` is LOCKED — the orchestrator's null→unknown_account
  translation STAYS. The resolver returning `null` still means "we can't
  resolve this claim to an account."
- No new error codes added to `SessionValidationErrorCode`. The existing
  `'unknown_account'` code is preserved for the edge case where email is
  absent from the token (provisioning impossible without an email).
- New migration number is `016` (015 is WP-107's `is_suspended`).
- `VerifiedSessionClaim` extension is ADDITIVE OPTIONAL only — existing
  consumers must compile unchanged.
- The resolver NEVER throws. All failure paths return typed `Result`.
- Import `createPlayerAccount` is FORBIDDEN in `accountResolver.logic.ts`
  — the new helper (`provisionPlayerAccount`) encapsulates the SQL; it
  does NOT call `createPlayerAccount` (to avoid touching the locked
  WP-052 contract surface and to use `ON CONFLICT` semantics that
  `createPlayerAccount` doesn't support).

### Session protocol

- Stop and ask on unclear items.
- If a locked file needs modification, STOP — it requires architectural
  review first.

### Locked contract values

- `VerifiedSessionClaim.email` — type: `string | undefined` (optional field)
- `VerifiedSessionClaim.displayName` — type: `string | undefined` (optional field)
- Migration filename: `016_add_auth_provider_unique_constraint.sql`
- UNIQUE index name: `players_auth_provider_sub_unique`
- ON CONFLICT target: `(auth_provider, auth_provider_id)`
- Email validation gate: defined + non-empty after `.trim()` + contains `'@'`
- Email canonicalization: `.trim().toLowerCase()` before any use (insert value AND fallback-name source)
- Display name fallback: `normalizedEmail.split('@')[0].slice(0, 64)`
- Display name from claim: `claim.displayName.trim().slice(0, 64)` (only if `.trim().length > 0`)
- Display name max length: 64 characters (per existing `validateDisplayName`)
- Provisioning atomicity: single INSERT statement (no multi-step write sequence)
- Provisioning idempotency: same `(auth_provider, auth_provider_id)` → same `accountId` always

### Locked Policies

**Email-not-verified policy:** The system accepts `email.is_verified = false`
tokens for provisioning. Rationale: Hanko is the trust boundary for
authentication. If Hanko issued a valid signed JWT with a `sub` claim,
the user has completed Hanko's own verification flow (which includes
email confirmation by default). The `is_verified` field in the JWT
payload reflects Hanko's internal state tracking, not our trust
decision. We trust the JWT signature, not individual claim metadata.

**Missing email policy:** If the JWT carries no parseable email claim,
provisioning is impossible (the `legendary.players.email` column is
`NOT NULL`). The resolver returns `Result.ok(null)` and the existing
`'unknown_account'` path activates. This is expected to be vanishingly
rare — Hanko's default flow requires an email.

**Missing name policy:** If the JWT carries no `name` claim (common —
Hanko doesn't collect names by default), `displayName` defaults to the
email local-part (e.g., `jeff` for `jeff@barefootbetters.com`). Capped
at 64 chars per existing validation. The user can change it later via
the WP-104 profile edit endpoint.

## Acceptance Criteria

1. A brand-new Hanko user's first `GET /api/me/profile` call returns
   200 with a valid profile (not 401 `unknown_account`).
2. A second identical call returns the same `accountId` (idempotent —
   no duplicate row).
3. Two concurrent first calls from the same user result in exactly one
   `legendary.players` row (UNIQUE constraint + ON CONFLICT).
4. Existing users (row already present) see no behavior change.
5. A token missing the `email` claim (or with whitespace-only /
   missing-`@` email) returns 401 `unknown_account` (no crash, no 500)
   AND does NOT create a row in `legendary.players`.
6. `VerifiedSessionClaim` extension is backwards-compatible — existing
   test suites pass unchanged (the fields are optional).
7. The UNIQUE index migration is idempotent (`IF NOT EXISTS`).
8. D-16006 status in DECISIONS.md is `Superseded by D-17401`.
9. Server test suite passes with new tests covering: happy-path
   provisioning, concurrent-insert conflict resolution, missing-email
   fallback, duplicate-email (different provider) fallback.
10. `pnpm -r build` exits 0.

## Verification Steps

```bash
# Build
pnpm -r build

# Run server tests
pnpm --filter @legendary-arena/server test

# Grep gates
# 1. accountResolver imports provisionPlayerAccount, NOT createPlayerAccount
grep -c "createPlayerAccount" apps/server/src/auth/accountResolver.logic.ts
# Expected: 0

# 2. identity.logic.ts unchanged
git diff HEAD -- apps/server/src/identity/identity.logic.ts
# Expected: empty

# 3. identity.types.ts unchanged
git diff HEAD -- apps/server/src/identity/identity.types.ts
# Expected: empty

# 4. accountLookup.logic.ts unchanged
git diff HEAD -- apps/server/src/auth/accountLookup.logic.ts
# Expected: empty

# 5. sessionToken.logic.ts unchanged
git diff HEAD -- apps/server/src/auth/sessionToken.logic.ts
# Expected: empty

# 6. UNIQUE index exists in migration
grep -c "players_auth_provider_sub_unique" data/migrations/016_add_auth_provider_unique_constraint.sql
# Expected: 1
```

## Definition of Done

- [ ] All acceptance criteria met
- [ ] All verification steps pass
- [ ] Server test baseline increases (new provisioning tests)
- [ ] `pnpm -r build` exits 0
- [ ] DECISIONS.md updated: D-17401..D-17406 landed, D-16006 superseded
- [ ] WORK_INDEX.md row updated
- [ ] api-endpoints.md updated if behavior text changes
- [ ] EC-196 status flipped to Done in EC_INDEX.md

## Lint Gate Self-Review

| § | Verdict | Notes |
|---|---------|-------|
| 1 | ✅ PASS | All 10 sections present and non-empty |
| 2 | ✅ PASS | Engine-wide + packet-specific + session protocol + locked values |
| 3 | ✅ PASS | All deps listed and verified Done |
| 4 | ✅ PASS | No WP file modified (only new code + additive type extension) |
| 5 | ✅ PASS | §Scope (In) is explicit enumeration |
| 6 | ✅ PASS | §Out of Scope lists 7 explicit exclusions |
| 7 | ✅ PASS | §Files Expected to Change is complete allowlist |
| 8 | ✅ PASS | §Acceptance Criteria: 10 binary, observable checks |
| 9 | ✅ PASS | §Verification Steps: exact commands + expected output |
| 10 | ✅ PASS | §Definition of Done: checklist with governance updates |
| 11 | ✅ PASS | No cross-layer boundary violation (server layer only) |
| 12 | ✅ PASS | No engine import |
| 13 | ✅ PASS | No new phase/stage/move/trigger/effect |
| 14 | ✅ PASS | No G mutation |
| 15 | ✅ PASS | No persistence boundary violation (server layer owns writes) |
| 16 | ✅ PASS | No registry import |
| 17 | ✅ PASS | Vision alignment: N/A (server-only; no UI) |
| 18 | ✅ PASS | No boardgame.io import in new helper |
| 19 | ✅ PASS | No Math.random() |
| 20 | ✅ PASS | No SFC / client change |
| 21 | ✅ PASS | api-endpoints.md update noted in DoD (behavior text change — `unknown_account` becomes unreachable for valid tokens; no route shape change, no new endpoint, so catalog rows keep same Status/Auth) |
| 22-38 | ✅ PASS / N/A | Remaining items non-applicable or satisfied |

## Amendments

**2026-05-24 — Tightening pass (10 items, post-external-review):**
1. Added explicit Resolver Contract block to §C (lookup-first, idempotent, never-throw).
2. Tightened email validation: must contain `@` (rejects garbage without full validation).
3. Made display-name derivation deterministic: `trim().toLowerCase()` on email before use.
4. Added explicit idempotency guarantee to §E (same claim pair → same accountId always).
5. Strengthened duplicate-email comment (account-linking intentionally deferred — identity ambiguity).
6. Added rollback note to §D (index safe to leave in place; no DROP needed).
7. Tightened AC #5: explicitly asserts no row created on missing/invalid email.
8. Added `console.info` observability hook for provisioning events.
9. Qualified Goal sentence: "for valid tokens that include a parseable email claim."
10. Added atomicity requirement to §E (single INSERT, no multi-step sequence).
