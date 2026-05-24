# EC-197 — Arena Client Auth-Aware Navigation (Execution Checklist)

**Source:** docs/ai/work-packets/WP-175-arena-client-auth-nav.md
**Layer:** apps/arena-client (client-only)

## Before Starting
- [ ] WP-160 ✅ on main (Hanko client UI — auth store, LoginPage, hankoClient.ts)
- [ ] WP-174 ✅ on main (first-sign-in auto-provisioning)
- [ ] WP-161 ✅ on main (buildApiUrl helper)
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0
- [ ] `pnpm -r build` exits 0

## Locked Values (do not re-derive)
- Sign-in link target: `?route=login` (D-16008)
- Sign-out destination: `?route=` (lobby) (D-16004)
- Profile link target: `?route=me`
- Bootstrapping placeholder text: `"..."` (literal ellipsis)
- Display name fallback chain: `displayName` → `handle` → email local-part (first 16 chars) → `"My account"`
- `data-testid` prefix: `auth-nav-*`
- Bootstrapping state delivery: provide/inject (D-17501), NOT Pinia store
- SFC pattern: `defineComponent({ setup() { return {...} } })` (D-6512 / P6-30)

## Guardrails
- No `@teamhanko/*` imports outside `auth/hankoClient.ts` (F-2 broker confinement)
- No Pinia auth store shape extension — store file byte-identical pre/post
- No `apps/server/**`, `packages/game-engine/**`, `packages/registry/**` touched
- Sign-out try/catch must mirror `MyProfilePage.vue` fail-safe pattern (D-16004)
- No new HTTP endpoints; consume existing `/api/me/profile` read-only
- No `Math.random()`, no clock reads in composable
- No hamburger menu, no mobile drawer — same flex-row layout as existing nav
- "Watch Bot Play" lobby button remains functional for guests (no auth gating)

## Required `// why:` Comments
- `App.vue` provide(): why `isAuthBootstrapping` is provided via inject, not stored in Pinia
- `Header.vue` sign-out handler: why try/catch swallows broker failure (D-16004 fail-safe)
- `useAuthNav.ts` display name fetch: why fire-and-forget with "My account" fallback

## Files to Produce
- `apps/arena-client/src/composables/useAuthNav.ts` — **new** — auth nav composable
- `apps/arena-client/src/composables/useAuthNav.test.ts` — **new** — composable tests
- `apps/arena-client/src/components/branding/Header.vue` — **modified** — auth-aware nav
- `apps/arena-client/src/components/branding/Header.test.ts` — **new** — header render tests
- `apps/arena-client/src/App.vue` — **modified** — provide isAuthBootstrapping

## After Completing
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0
- [ ] `pnpm -r build` exits 0
- [ ] `grep -r '@teamhanko' apps/arena-client/src/ | grep -v 'auth/hankoClient.ts'` = 0 matches
- [ ] `docs/ai/DECISIONS.md` updated (D-17501..D-17506)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` status updated

## Common Failure Smells
- Auth store `stores/auth.ts` modified → guardrail violation (D-17501)
- `import { register } from '@teamhanko/hanko-elements'` outside hankoClient.ts → F-2 violation
- `<script setup>` in any `.vue` file → compile-mode violation (D-6512)
- Display name fetched during SSR or test without guard → missing `typeof window` check
