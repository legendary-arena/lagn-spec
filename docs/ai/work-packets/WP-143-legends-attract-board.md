# WP-143 — Legends Attract Board (Public Scoreboard SPA)

**Status:** Draft
**Primary Layer:** Client / new app (`apps/legends-board`)
**Dependencies:** WP-142 (Legends Snapshot Publisher — Done 2026-05-14)
**EC:** EC-164
**Baseline:** `origin/main` at WP-142 close (commit `42603cb`)

---

## Session Context

WP-142 publishes public leaderboard JSON snapshots to R2 at
`legends/v1/*`; this packet creates the public, no-auth SPA at
`legends.legendary-arena.com` that reads those snapshots and renders them
in an arcade-style attract board so anyone — not just authenticated players —
can see the Hall of Legends without touching the game-server API.

---

## Goal

After this packet, `apps/legends-board/` exists as a Vite-built Vue 3 SPA
deployed to `legends.legendary-arena.com` via Cloudflare Pages. It reads
leaderboard snapshots directly from R2 (no API origin, no auth state),
renders one panel per board (overall, weekly, by-scheme, recent
achievements, now-playing), and supports a `?kiosk=1` mode that auto-cycles
through panels for big-screen / Twitch-overlay use. Stale snapshots are
visibly marked with a "last updated" badge sourced from the publisher's
manifest.

---

## Assumes

- WP-142 deployed and `legends/v1/manifest.json` plus all expected board
  files are reachable at the R2 public-read URL.
- The R2 public-read prefix has appropriate CORS for browser fetches from
  `https://legends.legendary-arena.com`.
- Cloudflare Pages project for `apps/legends-board` can be created (DNS
  zone is on Cloudflare, per the deployment runbook in `docs/ops/DOMAINS.md`).
- `pnpm install` and `pnpm -r build` exit 0 against `main`.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirm the
  new app belongs alongside `apps/arena-client` and `apps/registry-viewer`,
  with the same import constraints (no `game-engine` runtime, no `server`).
- `apps/arena-client/package.json` — match its Vue 3 + Vite + Pinia + tsx
  test stack as closely as reasonable to keep dev workflow consistent.
- `apps/registry-viewer/package.json` — alternate reference for a
  data-only client (no game state, no boardgame.io). The legends board is
  closer to this shape.
- `docs/ops/DOMAINS.md §legends` — confirms the no-API-direct-hit rule and
  the snapshot-freshness UX expectation.
- `docs/ops/domains.json` — flip `legends.` `state` to `live` after
  Cloudflare Pages deploy completes (post-merge step).
- WP-142 packet — read the snapshot schema and manifest shape before
  writing the `snapshotClient`.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4, 6, 11, 13.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ for tooling
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents for every new or modified file (no diffs, no snippets, no "show only the changed section")
- Test files `.test.ts`
- Full-sentence error messages

**Packet-specific:**
- The SPA MUST NOT import `@legendary-arena/game-engine`,
  `@legendary-arena/server`, or call any URL on `api.legendary-arena.com`
  or `legendary-arena-server.onrender.com`. The only network reads are
  R2 public-read URLs.
- The SPA MUST NOT have any login UI, account UI, or auth state. No
  cookies set, no localStorage tokens, no session concept.
- The SPA MUST render a "last updated" indicator pulled from
  `manifest.json` `generatedAt`. If the manifest is older than a configurable
  threshold (default per D-14303), the indicator is rendered in a degraded /
  warning visual style.
- The SPA MUST be functional with JavaScript-blocked-but-HTML-shell-served
  for the first paint of the static "PRESS START" CTA. Full attract mode
  requires JS; a static fallback is rendered server-rendered-equivalent.
- Kiosk mode (`?kiosk=1`) MUST hide all chrome, disable any links that
  would navigate away, and respect `prefers-reduced-motion` for the cycling
  animation.

**Locked contract values:**
- Snapshot URL base: `https://<R2-public-host>/legends/v1/` (exact host
  finalized in WP-142 + D-14301)
- Manifest path: `legends/v1/manifest.json`
- Default cycle interval: 15 seconds per panel (D-14302)
- Stale threshold: 30 minutes (D-14303)
- Manifest poll interval: 60 seconds (D-14306)

### Locked Manifest Interpretation
- `manifest.boards` is an **ordered array**. UI MUST preserve this order
  for panel rendering and kiosk cycling. No alphabetical or UI-based
  reordering.
- Each entry `b` maps directly to the file path: `legends/v1/${b}.json`
- `b` is URL-safe and lowercase (enforced by the publisher; the client
  does not sanitize or transform board names)
- UI display names are derived client-side from `b` (e.g., `"overall"` →
  `"Overall"`, `"by-scheme"` → `"By Scheme"`). No server-provided labels.

### Snapshot Refresh Model (Locked Behavior)
- Manifest is polled every 60 seconds (D-14306; configurable via
  `VITE_LEGENDS_POLL_INTERVAL_MS` build-time env var)
- Boards are invalidated ONLY when `manifest.generatedAt` changes
- Board responses are cached in-memory for the lifetime of the page
- No background polling of individual board files
- "Force refresh" (debug mode only) bypasses cache and refetches
  manifest + all boards in one pass

### R2 Cache-Control Requirements
- `manifest.json` MUST be served with:
  `Cache-Control: no-cache, max-age=0` (ensures the client always
  validates freshness against R2 origin)
- Board files (`<board>.json`) MAY be served with:
  `Cache-Control: public, max-age=300` (5-min cache matches publisher
  cadence; stale board data is tolerable for one cycle)
- The client relies on manifest freshness (`generatedAt`), not on
  individual board timestamps. If the manifest is fresh but a board
  fetch returns cached-stale data, that is acceptable.
- These headers are configured on the R2 bucket (publisher-side,
  already scoped to WP-142's deployment). The SPA does not set
  request-side cache headers.

### Static Fallback Requirements
- `index.html` MUST include a visible "Hall of Legends" heading and
  explanatory text ("Live scoreboard requires JavaScript") rendered
  without JavaScript.
- The fallback content MUST be accessible: heading is an `<h1>`,
  body text is a `<p>`, no ARIA attributes required beyond semantic
  HTML.
- If JavaScript fails entirely (blocked, network error, parse error),
  the page remains non-blank and communicates why the live board is
  unavailable.

### Failure Modes

| Failure | UI Behavior |
|---------|-------------|
| Manifest fetch fails (network) | Full-page error panel: "Unable to load scoreboard data" with retry button |
| Manifest fetch fails (HTTP 4xx/5xx) | Same error panel with status code context |
| Individual board fetch fails | That panel shows "Data unavailable" placeholder; other panels unaffected |
| Manifest stale (>30 min) | Freshness badge renders in warning style; data still displayed |
| `manifest.boards` is empty array | Full-page "No boards available" state (not an error — publisher may be initializing) |
| Board JSON malformed | Panel shows parse-error placeholder; does not crash app |

**Session protocol:**
- If WP-142's manifest schema is ambiguous, stop and ask. Do not invent
  field names; mirror exactly what the publisher writes.

---

## Debuggability & Diagnostics

- All snapshot fetches log to the browser console with timing + cache state.
- A `?debug=1` URL flag exposes a footer with: snapshot URL, manifest
  `generatedAt`, current panel, cycler state, and a "force refresh" button.
- Failed snapshot fetches render a clearly-labeled error panel (not a
  silent blank) with the failure reason.

---

## Scope (In)

### A) New app skeleton
- **`apps/legends-board/package.json`** — new:
  - Name: `@legendary-arena/legends-board`
  - Match `apps/registry-viewer` for build/test/typecheck/lint scripts
- **`apps/legends-board/vite.config.ts`** — new
- **`apps/legends-board/index.html`** — new — includes static fallback CTA
- **`apps/legends-board/src/main.ts`** — new
- **`apps/legends-board/src/App.vue`** — new
- **`apps/legends-board/tsconfig.json`** — new

### B) Snapshot client
- **`apps/legends-board/src/snapshots/snapshotClient.ts`** — new:
  - `fetchManifest(): Promise<LegendsManifest>`
  - `fetchBoard(name: string): Promise<LegendsSnapshot>`
  - In-memory cache with manifest-driven invalidation
  - Type definitions mirror WP-142's `legends.types.ts` shape exactly
- **`apps/legends-board/src/snapshots/snapshotClient.test.ts`** — new

### C) Panel components (one per board)
- **`apps/legends-board/src/panels/OverallPanel.vue`** — new
- **`apps/legends-board/src/panels/WeeklyPanel.vue`** — new
- **`apps/legends-board/src/panels/BySchemePanel.vue`** — new
- **`apps/legends-board/src/panels/RecentAchievementsPanel.vue`** — new (marquee scroll)
- **`apps/legends-board/src/panels/NowPlayingPanel.vue`** — new

### D) Attract mode
- **`apps/legends-board/src/attract/AttractCycler.vue`** — new — cycles panels
  on a configurable interval, pauses on hover (non-kiosk), respects
  `prefers-reduced-motion`.
- **`apps/legends-board/src/attract/kioskMode.ts`** — new — query-string
  parse and CSS class binding for kiosk vs default mode.

### E) Freshness indicator
- **`apps/legends-board/src/freshness/FreshnessBadge.vue`** — new — renders
  "Updated 3 min ago" pulled from manifest, degrades to warning style past
  the threshold.

### F) Tests
- Unit tests for `snapshotClient` (manifest-driven cache, error paths)
- Unit tests for `kioskMode` query-string parser
- Component test for `FreshnessBadge` covering fresh / stale / unreachable

### G) Deployment glue
- **`docs/ops/domains.json`** — modified — `legends.` entry already exists
  (added pre-WP); on first successful Pages deploy, flip `state` to `live`
  in a separate commit (out-of-band — not part of this packet's diff).
- **`docs/ops/DOMAINS.md`** — modified — fill in the build command + Pages
  project name once configured.

---

## Out of Scope

- The publisher (WP-142).
- Any read of `apps/server` HTTP endpoints. Hard rule per D-14301.
- Player profile pages, match detail pages, or replay viewers.
- Anti-cheat / score-correction UI.
- Comments, reactions, or any social/interaction features (this is
  read-only by design).
- Search, filtering, or query parameters beyond `?kiosk=1` and `?debug=1`.
- A native mobile app or PWA install prompt.
- "While I'm here" changes to `apps/arena-client` or `apps/registry-viewer`.

---

## Files Expected to Change

- `apps/legends-board/package.json` — **new**
- `apps/legends-board/vite.config.ts` — **new**
- `apps/legends-board/tsconfig.json` — **new**
- `apps/legends-board/index.html` — **new**
- `apps/legends-board/src/main.ts` — **new**
- `apps/legends-board/src/App.vue` — **new**
- `apps/legends-board/src/snapshots/snapshotClient.ts` — **new**
- `apps/legends-board/src/snapshots/snapshotClient.test.ts` — **new**
- `apps/legends-board/src/panels/OverallPanel.vue` — **new**
- `apps/legends-board/src/panels/WeeklyPanel.vue` — **new**
- `apps/legends-board/src/panels/BySchemePanel.vue` — **new**
- `apps/legends-board/src/panels/RecentAchievementsPanel.vue` — **new**
- `apps/legends-board/src/panels/NowPlayingPanel.vue` — **new**
- `apps/legends-board/src/attract/AttractCycler.vue` — **new**
- `apps/legends-board/src/attract/kioskMode.ts` — **new**
- `apps/legends-board/src/attract/kioskMode.test.ts` — **new**
- `apps/legends-board/src/freshness/FreshnessBadge.vue` — **new**
- `apps/legends-board/src/freshness/FreshnessBadge.test.ts` — **new**
- `pnpm-workspace.yaml` — **modified** if needed (workspace already globs `apps/*`)
- `docs/ai/DECISIONS.md` — **modified** — D-14301..D-14306
- `docs/ops/DOMAINS.md` — **modified** — fill in build/deploy specifics

No other files may be modified.

---

## Acceptance Criteria

### App skeleton
- [ ] `pnpm --filter @legendary-arena/legends-board build` exits 0
- [ ] `pnpm --filter @legendary-arena/legends-board test` exits 0
- [ ] `pnpm --filter @legendary-arena/legends-board typecheck` exits 0

### Snapshot client
- [ ] `snapshotClient` types match WP-142's published schema exactly
- [ ] Manifest is fetched first; board fetches use the manifest's board list
- [ ] No code path constructs an `api.legendary-arena.com` URL
- [ ] No code path constructs a `legendary-arena-server.onrender.com` URL
      (verified by `Select-String`)

### Panels & cycler
- [ ] Each board has exactly one panel component
- [ ] Panels render strictly in `manifest.boards` order (no reordering)
- [ ] `AttractCycler` cycles every N ms (N configurable; default per D-14302)
- [ ] Cycler pauses on hover in non-kiosk mode
- [ ] Cycler ignores hover in kiosk mode (`?kiosk=1`)
- [ ] Cycler respects `prefers-reduced-motion`

### Freshness
- [ ] `FreshnessBadge` renders "Updated <X> ago" using `manifest.generatedAt`
- [ ] Past the staleness threshold (D-14303), the badge renders in a warning style
- [ ] If manifest fetch fails entirely, badge renders an error state, not blank

### Auth / privacy
- [ ] No login UI exists in the SPA (`Select-String` for `login`, `signin`, `auth` returns no UI references)
- [ ] No cookies are set by the SPA (verified manually in DevTools)
- [ ] No request goes to any `*.onrender.com` or `api.legendary-arena.com` URL (verified manually with DevTools network tab on the staging deploy)

### Scope enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (`git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/legends-board build
# Expected: exits 0

# Step 2 — tests
pnpm --filter @legendary-arena/legends-board test
# Expected: green

# Step 3 — confirm no game-engine import
Select-String -Path "apps\legends-board\src\**\*.ts","apps\legends-board\src\**\*.vue" -Pattern "@legendary-arena/game-engine"
# Expected: no output

# Step 4 — confirm no API origin in code
Select-String -Path "apps\legends-board\src\**\*.ts","apps\legends-board\src\**\*.vue" -Pattern "api\.legendary-arena\.com|legendary-arena-server\.onrender\.com"
# Expected: no output

# Step 5 — confirm no auth UI
Select-String -Path "apps\legends-board\src\**\*.vue" -Pattern "login|signin|signup"
# Expected: no output

# Step 6 — confirm no browser storage usage
Select-String -Path "apps\legends-board\src\**\*.ts","apps\legends-board\src\**\*.vue" -Pattern "localStorage|sessionStorage|indexedDB"
# Expected: no output

# Step 7 — only files in scope changed
git diff --name-only
# Expected: matches "Files Expected to Change"

# Step 7 — staging deploy smoke test (manual)
node scripts/check-subdomains.mjs --include-planned
# Expected: legends. row turns OK once Pages deploy lands and the entry's
# state is flipped to "live" in a follow-up commit.
```

---

## Decisions to Record (DECISIONS.md)

- **D-14301** — The legends SPA reads from R2 directly and is forbidden from calling the game-server API. Trade-off: locks public scoreboard's blast radius (a viral surge cannot crash the game server) at the cost of cache-driven freshness staleness (mitigated by D-14302 cadence + D-14303 visible staleness UX).
- **D-14302** — Default attract-mode cycle interval: 15 seconds per panel. Trade-off: long enough to read top 10 entries; short enough that a kiosk display feels alive.
- **D-14303** — Stale-snapshot threshold: 30 minutes. Past this, the freshness badge degrades visibly. Reasoning: the publisher's default cadence is 5 min (D-14201); 30 min represents 6 missed cycles, a meaningful failure signal.
- **D-14304** — No auth, no cookies, no localStorage tokens. Public attract board has no concept of a user session. Any future "claim your handle" flow lives in `play.legendary-arena.com`, never here.
- **D-14305** — Kiosk mode is a URL-flag concern only, not a build-time mode. The same artifact serves both ordinary visitors and kiosk displays; no build matrix.
- **D-14306** — Manifest poll interval: 60 seconds. Trade-off: frequent enough that a publisher recovery is visible within ~1 min; infrequent enough that a viral page doesn't generate excessive R2 GETs (one manifest request per visitor per minute).

---

## Environment Variables

| Variable | Purpose | Where set |
|----------|---------|-----------|
| `VITE_LEGENDS_R2_BASE_URL` | Base URL for R2 snapshot fetches (e.g., `https://pub-xxx.r2.dev`) | Cloudflare Pages env var (build-time) |
| `VITE_LEGENDS_POLL_INTERVAL_MS` | Manifest poll interval override (default: `60000`) | Cloudflare Pages env var (build-time, optional) |

Both use the `VITE_` prefix (browser-exposed, build-time substitution).
No secrets. No `.env.example` needed (both have sensible defaults or are
deployment-environment-specific).

---

## Vision Alignment

**Vision clauses touched:** §3 (Player Trust & Fairness — public scoreboard
displays only already-public handles + scores), §22 (Scoring & Skill
Measurement — displays PAR scores read-only), §24 (Public Leaderboards —
this IS the public leaderboard surface).

**Conflict assertion:** No conflict: this WP preserves all touched clauses.
The SPA is a read-only projection of already-published data; it introduces
no new scoring logic, no new identity model, and no new write paths.

**Non-Goal proximity check:** NG-1 (no pay-to-win — N/A, read-only display),
NG-2 (no pay-to-skip — N/A), NG-3 (no loot boxes — N/A), NG-4 (no
subscription gates — N/A, fully public), NG-5 (no ads — N/A), NG-6 (no
data selling — N/A, no tracking), NG-7 (no artificial scarcity — N/A).
None crossed.

**Determinism preservation:** N/A — this WP does not touch scoring, replay,
RNG, or simulation logic. It displays pre-computed results.

---

## Funding Surface Gate

**N/A** — this WP implements a read-only public scoreboard that displays
leaderboard data. It contains no global navigation funding affordances
(§A), no registry viewer funding affordances (§B), no profile/account
funding attribution surfaces (§C), no tournament funding integrations,
and no user-visible copy referencing "donate", "support tournaments", or
equivalent terms as part of a user interaction. Authority: WP-097, D-9701,
D-9801.

---

## Lint Gate Self-Review

| § | Verdict | Notes |
|---|---------|-------|
| §1 Structure | PASS | All 10 required sections present |
| §2 Constraints | PASS | Engine-wide + packet-specific + session protocol + locked values |
| §3 Prerequisites | PASS | WP-142 dep explicit; R2/CORS/CF Pages external state listed |
| §4 Context | PASS | ARCHITECTURE.md, 00.6, DOMAINS.md, WP-142 all cited specifically |
| §5 Output | PASS (deviation) | 21 files — justified below; all marked new/modified |
| §6 Naming | PASS | No canonical field names at risk (client-only, no engine types) |
| §7 Dependencies | PASS | Only `vue` + `@vitejs/plugin-vue`; no forbidden packages |
| §8 Boundaries | PASS | Zero server/engine/registry/preplan imports; client-only layer |
| §9 Windows | PASS | Verification uses `Select-String` (PowerShell); no bash |
| §10 Env vars | PASS | `VITE_` prefixed, documented with purpose and location |
| §11 Auth | N/A | No authentication surface |
| §12 Tests | PASS | `node:test` only; no boardgame.io; no network/DB |
| §13 Commands | PASS | All `pnpm`; exact commands with expected output |
| §14 Acceptance | PASS | 18 binary, observable items with file/function references |
| §15 Definition of Done | PASS | STATUS, DECISIONS, WORK_INDEX, scope-boundary all present |
| §16 Code style | PASS | 00.6 referenced in constraints; no premature abstraction risk |
| §17 Vision | PASS | §3, §22, §24 cited; no conflict; NG-1..7 checked; determinism N/A |
| §18 Prose-vs-grep | PASS | No verification greps target tokens also in prose |
| §19 Bridge staleness | N/A | No repo-state-summarizing artifact authored |
| §20 Funding | N/A | Justified: read-only scoreboard, no funding surfaces or copy |
| §21 API catalog | N/A | No HTTP endpoints added/modified in `apps/server` |

---

## File Count Justification (§5 Deviation)

This packet produces ~21 files, exceeding the §5 ≤8 guidance. Justified:
the files form a single cohesive app scaffold (not a refactor across
multiple existing packages). Splitting would produce two WPs with an
artificial boundary inside one app — a wrong abstraction. Precedent:
WP-115 (12 files), WP-104 (14 files), WP-110 (16 files) all shipped as
single packets with the same justification.

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/legends-board build` exits 0
- [ ] `pnpm --filter @legendary-arena/legends-board test` exits 0
- [ ] Cloudflare Pages project created and connected to GitHub
- [ ] Custom domain `legends.legendary-arena.com` attached to the Pages project
- [ ] Manual smoke: open `https://legends.legendary-arena.com` in a fresh
      browser, confirm DevTools shows zero requests to any `api.` or
      `*.onrender.com` host, only R2 public-read URLs
- [ ] `node scripts/check-subdomains.mjs --include-planned` shows `legends.`
      OK after the deploy lands, then a follow-up commit flips its `state`
      to `"live"` in `docs/ops/domains.json`
- [ ] `docs/ai/STATUS.md` updated — public scoreboard now exists
- [ ] `docs/ai/DECISIONS.md` updated — D-14301..D-14306
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-143 checked off with date
- [ ] 01.5 NOT INVOKED (zero engine touch)
