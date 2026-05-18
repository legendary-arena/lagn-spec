# WP-161 — Arena Client API Base URL Surfacing

**Status:** Drafted 2026-05-18 (single-session draft + execute pattern; surfaced as a hard prerequisite for WP-160's smoke verification, scoped separately rather than folded inline because EC-174 is `Done`).
**Primary Layer:** App / Client (`apps/arena-client/src/lib/api/**`)
**Dependencies:** WP-104, WP-106, WP-108, WP-110, WP-132, WP-133, WP-160 — all ✅.
**Unblocks:** End-to-end exercise of every authenticated `/api/me/*` HTTP path from the deployed arena-client SPA. WP-160's smoke verification (operator-side, post-merge) is the immediate first user.

---

## Goal

Replace the hardcoded relative `/api/*` URLs in every arena-client API client with absolute URLs constructed from a new build-time env var `VITE_API_BASE_URL`. The change is mechanical and per-fetch-call: `fetch('/api/me/profile', …)` → `fetch(buildApiUrl('/api/me/profile'), …)`. The new helper module reads `import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000'` (matches the `VITE_SERVER_URL` precedent's local-dev fallback) and prefixes paths.

---

## Justification

### The bug WP-160's smoke surfaced

Every API client in `apps/arena-client/src/lib/api/` issues `fetch('/api/...', …)` with a **relative URL**. On the deployed `https://legendary-arena-play.pages.dev` host, this resolves to `https://legendary-arena-play.pages.dev/api/me/profile`. Cloudflare Pages has no `/api/*` rewrite or proxy; the SPA fallback kicks in and the request returns `HTTP 200 Content-Type: text/html` (the SPA's `index.html`). The fetch wrapper sees `status === 200`, skips its `parseFailure` branch, and runs `await response.json()` against the HTML body, which throws `SyntaxError`. The rejection propagates out of `load()` in `MyProfilePage` and is silently swallowed by the `void load()` pattern in `onMounted`. Page state stays at `'loading'` indefinitely → "Loading your profile…" hangs.

This was structurally invisible until WP-160 introduced the first end-to-end authenticated client path — every authenticated WP (WP-104 / WP-106 / WP-108 / WP-110 / WP-132 / WP-133) inherited the same relative-URL assumption, but none had a sign-in flow to actually exercise the path. The first authenticated request from production surfaced the gap.

### Why a new env var, not a CF Pages `_redirects` rewrite

A `_redirects` file (`/api/* → https://api.legendary-arena.com/api/:splat 200`) was the smaller-blast-radius alternative. We rejected it because:

- **Couples the SPA's deployment topology to the API's hostname implicitly.** A `_redirects` file living in the SPA's `public/` dir hard-codes the API hostname into the client deployment; changing the API host requires editing the SPA repo even when the API team owns the move. An explicit env var makes the dependency a contract.
- **Doesn't generalize.** Local dev, staging, and production all need different API targets. A `_redirects` rewrite is the same string everywhere; an env var per-environment is the right shape.
- **`VITE_SERVER_URL` already exists as the precedent.** The boardgame.io live-match transport uses `VITE_SERVER_URL` (consumed at `apps/arena-client/src/lobby/lobbyApi.ts:21`). Adding `VITE_API_BASE_URL` for HTTP API calls mirrors that pattern; an operator who knows where to set one already knows where to set the other.

### Why this is its own WP

EC-174 (WP-160) is `Done`. Folding this change into a follow-up `EC-174:` commit would require reopening that EC's allowlist after close. The API client files were also locked under WP-104 / WP-108 / WP-110 contract surfaces (not strictly `.types.ts` / `.validate.ts` / `.gating.ts`, but contract-adjacent). A separate WP with its own EC, DECISIONS entry, and post-execution governance close is the correct scoping.

This WP is intentionally minimal — a single helper module + 7 fetch-site rewrites + 1 `.env.example` entry. It does not change any HTTP wire contract, does not introduce any new dependency, does not change any function signature, and does not touch the server.

---

## Session Context

The arena-client's API client surface today:

| File | Fetch sites | WP origin |
|---|---|---|
| `apps/arena-client/src/lib/api/ownerProfileApi.ts` | 3 (lines 112, 137, 167) | WP-104 |
| `apps/arena-client/src/lib/api/billingApi.ts` | 2 (lines 73, 98) | WP-108 |
| `apps/arena-client/src/lib/api/adminBillingApi.ts` | 1 (line 46) | WP-110 |
| `apps/arena-client/src/lib/api/profileApi.ts` | 1 (line 84) | WP-102 |
| **Total** | **7 sites across 4 files** | |

All seven fire `fetch('/api/...', …)` against relative paths. None have unit tests (the only tests in `apps/arena-client/src/**` cover the engine + Pinia + components, not the API clients).

The `VITE_SERVER_URL` precedent:

```ts
// apps/arena-client/src/lobby/lobbyApi.ts:21
export const serverUrl: string =
  import.meta.env?.VITE_SERVER_URL ?? 'http://localhost:8000';
```

WP-161 mirrors this shape for `VITE_API_BASE_URL`.

The CF Pages production env already has `VITE_SERVER_URL=https://api.legendary-arena.com` set (per the operator's screenshot during WP-160's smoke verification). The new `VITE_API_BASE_URL` is the same string in this deployment (the boardgame.io server and the HTTP API are co-served on `api.legendary-arena.com`); future deployments could split them.

---

## Vision Alignment

**Vision clauses touched:** §3 (Player Trust & Fairness — operational reliability is part of trust).

**Conflict assertion:** No conflict. WP-161 is a transport-layer plumbing fix; no gameplay, scoring, replay, or persistence surface is touched.

---

## Funding Surface Gate (§20)

**§20 N/A.** WP-161 introduces no user-visible copy, no funding surface, no donation affordance.

---

## API Catalog Update Obligation (§21)

**§21 N/A.** WP-161 is client-only. No file under `apps/server/src/**` is added, modified, or removed. No HTTP endpoint is added, modified, or status-changed. The `api-endpoints.md` catalog is unchanged.

---

## Assumes

- `pnpm install && pnpm -r build` exits 0 on `origin/main` (post-WP-160-merge baseline at `285ed3b`).
- The Cloudflare Pages deployment of arena-client has build-time access to `VITE_*` env vars (verified via `VITE_SERVER_URL` precedent).
- The server's HTTP API is reachable from the SPA's origin via the URL set in `VITE_API_BASE_URL` (today: `https://api.legendary-arena.com`, with CORS allowlist already permitting `https://legendary-arena-play.pages.dev` per EC-147).
- None of the four API client files have associated `.test.ts` files (verified by grep — only the wrapper / store / page components have tests).

---

## Non-Negotiable Constraints

### Engine-wide

- ESM only, Node v22+
- Full file contents for every new or modified file (no diffs, no snippets)
- All commands use `pnpm` — never `npm run`
- No new npm dependencies

### Packet-specific — helper shape

- The helper module lives at `apps/arena-client/src/lib/api/apiBaseUrl.ts` (new file).
- Exports exactly two named symbols: `apiBaseUrl: string` (the resolved base URL) and `buildApiUrl(path: string): string` (the prefix function).
- `buildApiUrl` does NOT validate `path` (callers are trusted — they pass literal string paths). It does NOT URL-encode anything (the caller is responsible for path-segment encoding, as `profileApi.ts` already does for `:handle`). It does NOT append/strip trailing slashes on `apiBaseUrl`.
- Implementation:
  ```ts
  export const apiBaseUrl: string =
    import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000';

  export function buildApiUrl(path: string): string {
    return `${apiBaseUrl}${path}`;
  }
  ```

### Packet-specific — fetch-site rewrites

- Every `fetch('/api/...', …)` call across the 4 API client files MUST become `fetch(buildApiUrl('/api/...'), …)`.
- The path argument to `buildApiUrl` MUST remain a literal string starting with `/api/` (or, in `profileApi.ts`'s case, a template literal that constructs the path).
- No other change to any API client file. Function signatures, return shapes, error handling, and JSDoc are preserved byte-identical except for the import line and the fetch-site rewrite.

### Packet-specific — env var hygiene

- `apps/arena-client/.env.example` gets a new `VITE_API_BASE_URL` block, documented analogously to the existing `VITE_SERVER_URL` and `VITE_HANKO_TENANT_BASE_URL` blocks.
- The local-dev fallback is `http://localhost:8000` (matches `VITE_SERVER_URL` precedent).
- The `// why:` comment on the env var entry MUST note that production deployments MUST set this in the Cloudflare Pages env (Vite inlines at build time).

### Packet-specific — test discipline

- The four API client files have no associated test files today. WP-161 does NOT add tests for them — adding fetch-mock tests for a 1-line URL change would be ceremonial. The smoke verification (operator-side, post-merge) is the load-bearing test.
- The arena-client test baseline MUST remain `326 / 0 / 0 / 0` (no test count change).

### Packet-specific — boundary discipline

- Zero modifications outside `apps/arena-client/` + the 4 governance files.
- No `apps/server/src/**` touch. No `packages/**` touch. No `data/**` touch. No `docs/ai/REFERENCE/api-endpoints.md` touch.
- The Vite `failOnNodeExternalization` guard at `vite.config.ts:22` MUST remain green (no `node:*` import introduced via the new helper).

### Session protocol

- If `pnpm install --frozen-lockfile` fails for any reason (lockfile drift, dep resolution issue), STOP and surface — WP-161 introduces no dep changes; any failure here is unrelated.
- If `pnpm --filter @legendary-arena/arena-client build` throws `Boundary Leakage detected (D-14401)`, STOP — same reasoning (no new deps; any failure is unrelated).
- If any API client file's structure has drifted from the line numbers in §Session Context above, re-verify the fetch sites before patching.

### Locked contract values

- **New build-time client env var:** `VITE_API_BASE_URL` (mirrors `VITE_SERVER_URL` precedent)
- **Helper module path:** `apps/arena-client/src/lib/api/apiBaseUrl.ts` (new file)
- **Helper exports:** `apiBaseUrl: string`, `buildApiUrl(path: string): string` (exactly 2)
- **Local-dev fallback:** `http://localhost:8000` (matches the `VITE_SERVER_URL` precedent's fallback)
- **Decisions reserved:** D-16101 (env-var-based API base URL surfacing)

---

## Scope (In)

### A) API base URL helper — NEW

**File:** `apps/arena-client/src/lib/api/apiBaseUrl.ts` — **new**

Exports `apiBaseUrl: string` and `buildApiUrl(path: string): string` per §Locked Values.

### B) `ownerProfileApi.ts` — MODIFIED

**File:** `apps/arena-client/src/lib/api/ownerProfileApi.ts`

- Add `import { buildApiUrl } from './apiBaseUrl';` at the top.
- Replace `fetch('/api/me/profile', …)` at lines 112 and 137 with `fetch(buildApiUrl('/api/me/profile'), …)`.
- Replace `fetch('/api/me/links', …)` at line 167 with `fetch(buildApiUrl('/api/me/links'), …)`.
- All other code byte-identical.

### C) `billingApi.ts` — MODIFIED

**File:** `apps/arena-client/src/lib/api/billingApi.ts`

- Add `import { buildApiUrl } from './apiBaseUrl';` at the top.
- Replace `fetch('/api/me/billing/history', …)` at line 73 with `fetch(buildApiUrl('/api/me/billing/history'), …)`.
- Replace `fetch('/api/me/entitlements', …)` at line 98 with `fetch(buildApiUrl('/api/me/entitlements'), …)`.
- All other code byte-identical.

### D) `adminBillingApi.ts` — MODIFIED

**File:** `apps/arena-client/src/lib/api/adminBillingApi.ts`

- Add `import { buildApiUrl } from './apiBaseUrl';` at the top.
- Replace `fetch('/api/admin/billing/history', …)` at line 46 with `fetch(buildApiUrl('/api/admin/billing/history'), …)`.
- All other code byte-identical.

### E) `profileApi.ts` — MODIFIED

**File:** `apps/arena-client/src/lib/api/profileApi.ts`

- Add `import { buildApiUrl } from './apiBaseUrl';` at the top.
- Change `const url = \`/api/players/${encodeURIComponent(handle)}/profile\`;` at line 81 to `const url = buildApiUrl(\`/api/players/${encodeURIComponent(handle)}/profile\`);`.
- All other code byte-identical.

### F) `.env.example` — MODIFIED

**File:** `apps/arena-client/.env.example`

Add `VITE_API_BASE_URL` block analogous to the existing two entries, with a `// why:` comment noting that CF Pages production deployments must set this.

### G) Governance — MODIFIED

- `docs/ai/work-packets/WORK_INDEX.md` — add WP-161 row, flipped to `[x]` at execution close
- `docs/ai/execution-checklists/EC_INDEX.md` — add EC-175 row, Status `Done`
- `docs/05-ROADMAP-MINDMAP.md` — add WP-161 ✅ to a relevant cluster (Auth Stack & Profile Surface is the closest fit; this WP is the operational prerequisite for that cluster's WPs to actually function on production)
- `docs/ai/DECISIONS.md` — append D-16101

---

## Out of Scope

- Adding unit tests for the API client files (deferred; fetch-mock tests for a URL-prefix change are ceremonial)
- Adding a CF Pages `_redirects` proxy as a parallel path (rejected per §Justification)
- Refactoring the API client files' shared `parseFailure` / wire-shape patterns into a shared module (separate concern; WP-161 is URL-only)
- Adding a runtime check that `apiBaseUrl` is non-empty / well-formed (the build-time env var precedent doesn't validate either; if the operator misconfigures, the failure is visible)
- Adding `VITE_API_BASE_URL` to `render.yaml` (the server doesn't consume it; it's client-only)
- Updating the marketing-site repo or any cross-repo work
- Updating `api-endpoints.md` (no endpoint contract change)

---

## Files Expected to Change

**New (1):**
- `apps/arena-client/src/lib/api/apiBaseUrl.ts`

**Modified (5):**
- `apps/arena-client/src/lib/api/ownerProfileApi.ts`
- `apps/arena-client/src/lib/api/billingApi.ts`
- `apps/arena-client/src/lib/api/adminBillingApi.ts`
- `apps/arena-client/src/lib/api/profileApi.ts`
- `apps/arena-client/.env.example`

**Governance (4):**
- `docs/ai/work-packets/WORK_INDEX.md`
- `docs/ai/execution-checklists/EC_INDEX.md`
- `docs/05-ROADMAP-MINDMAP.md`
- `docs/ai/DECISIONS.md` (D-16101)

**10 files total.** Tightly-bounded; mechanical URL-prefix change.

---

## Acceptance Criteria

- [ ] `apps/arena-client/src/lib/api/apiBaseUrl.ts` exists; exports `apiBaseUrl: string` and `buildApiUrl(path: string): string`; reads `import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000'`
- [ ] All 7 fetch sites across the 4 API client files use `buildApiUrl('/api/...')` — repo-wide grep `grep -rn "fetch\('/api" apps/arena-client/src/lib/api/` returns ZERO matches
- [ ] Grep `grep -rn "buildApiUrl\('/api" apps/arena-client/src/lib/api/` returns exactly 7 matches (one per fetch site, OR a template-literal equivalent in `profileApi.ts`)
- [ ] `apps/arena-client/.env.example` documents `VITE_API_BASE_URL`
- [ ] `pnpm install --frozen-lockfile` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0 with no `Boundary Leakage detected` thrown
- [ ] `pnpm --filter @legendary-arena/arena-client test` shows `326 / 0 / 0 / 0` (no test count change from WP-160's baseline)
- [ ] `git diff --stat -- 'apps/server/**' 'packages/**' 'data/**' 'docs/ai/REFERENCE/**'` is empty
- [ ] D-16101 appended to DECISIONS.md (Decision + Rationale + Alternatives Rejected)
- [ ] WP-161 marked `[x]` in WORK_INDEX with post-execution summary
- [ ] EC-175 marked `Done <date>` in EC_INDEX
- [ ] ROADMAP-MINDMAP includes WP-161 ✅; Progress Summary bumped; Last Updated footer current

---

## Verification Steps

```pwsh
# No relative /api/* fetches remain
Get-ChildItem apps/arena-client/src/lib/api -Filter *.ts | Select-String -Pattern "fetch\('/api"
# Expected: no matches

# buildApiUrl is used at every fetch site
Get-ChildItem apps/arena-client/src/lib/api -Filter *.ts | Select-String -Pattern "buildApiUrl\("
# Expected: at least 7 matches (one per fetch site)

# Helper module exports the two named symbols
Select-String -Path apps/arena-client/src/lib/api/apiBaseUrl.ts -Pattern "^export "
# Expected: 2 matches

# Env var documented
Select-String -Path apps/arena-client/.env.example -Pattern "VITE_API_BASE_URL"
# Expected: at least 1 match

# Build + tests still green
pnpm --filter @legendary-arena/arena-client build
pnpm --filter @legendary-arena/arena-client test
# Expected: exit 0; 326 tests pass

# CF Pages CI parity
pnpm install --frozen-lockfile
# Expected: exit 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria pass
- [ ] STATUS.md updated with WP-161 completion entry
- [ ] D-16101 landed in DECISIONS.md (Decision + Rationale + Alternatives Rejected)
- [ ] WORK_INDEX.md WP-161 marked `[x]`
- [ ] EC_INDEX.md EC-175 marked Done
- [ ] ROADMAP-MINDMAP updated
- [ ] 01.5 NOT INVOKED (no engine surface touched)
- [ ] 01.6 post-mortem SKIPPED (mechanical URL-prefix change; no new long-lived abstraction; helper is 5 lines)
- [ ] No files outside the "Files Expected to Change" list were modified

---

## Lint Gate Self-Review

All 21 sections per `00.3` pass or are explicitly N/A-justified:

- §1–6 PASS (structure, constraints, prerequisites, references, completeness, naming)
- §7 PASS (no new deps)
- §8 PASS (app layer only; no engine import; no server import; no registry runtime)
- §9 PASS (Verification Steps use PowerShell)
- §10 PASS (`VITE_API_BASE_URL` documented in `.env.example`)
- §11 PASS (no new auth surface; bearer-header attachment unchanged)
- §12 PASS (no test count change; no fetch-mock theater)
- §13 PASS (deterministic verification commands)
- §14 PASS (binary, observable acceptance criteria)
- §15 PASS (DoD enumerates STATUS / DECISIONS / WORK_INDEX / EC_INDEX / ROADMAP)
- §16 PASS (small helper, junior-readable)
- §17 PASS (Vision §3 cited; no conflict)
- §18 N/A (no broker invisibility concern; this WP touches no auth-broker surface)
- §19 PASS (not a state-summarizing artifact)
- §20 N/A justified (no funding surface)
- §21 N/A justified (client-only WP; no `apps/server/src/**` touch)

**Final Gate: PASS.**

---

## Pre-Flight Verdict

**READY TO EXECUTE.**

- **Class:** Limited Runtime Wiring (URL construction; no contract change; no new dep)
- **Deps:** WP-104, WP-106, WP-108, WP-110, WP-132, WP-133, WP-160 — all ✅
- **Scope Lock:** PASS (6 source files + 4 governance = 10 total; well under the ~8 cap when counting the governance separately)
- **Test Expectations:** PASS (no test count change — baseline 326 preserved)
- **Risk:** Single risk — operator forgets to set `VITE_API_BASE_URL` on CF Pages post-merge. Mitigation: same as `VITE_HANKO_TENANT_BASE_URL` post-merge protocol; documented in commit body + STATUS update.

---

## Copilot Check Verdict

**PASS** (per `01.7`). Reviewed against the 30 failure-mode lens. Zero blocking conditions. No long-lived abstraction introduced (helper is a 5-line module). No new contract surface (URL string only). No determinism / replay / persistence concern.

---

## Notes for Execution Session

This WP is being drafted and executed in the same Claude Code session as WP-160's smoke verification follow-up (deviation from the standard one-WP-per-session rule, justified by: (a) the work surfaced as a hard prerequisite for WP-160's smoke; (b) the change is mechanical and 10 files including governance; (c) splitting into a separate session would lose the diagnostic context that surfaced the bug). The deviation is documented in the commit body for traceability.
