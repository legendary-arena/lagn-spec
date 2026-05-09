# WP-143 — Legends Attract Board (public scoreboard SPA)

**Status:** Draft (skeleton — not yet linted, not yet added to WORK_INDEX.md)
**Primary Layer:** Client / new app (`apps/legends-board`)
**Dependencies:** WP-142 (snapshot publisher must be live and writing `legends/v1/*` to R2 before this app has anything to render), WP-[NNN — arena-client app baseline that established the Vue 3 + Vite client conventions]

> **Skeleton notes (delete on promotion to Ready):**
> - WP number is provisional. Confirm next free slot vs WORK_INDEX.md.
> - Lint gate (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) must pass before promotion.
> - DECISIONS placeholders D-LEG-1 … D-LEG-5 — renumber at promotion time.
> - Visual / aesthetic decisions (typography, scanline shader, panel layouts) are deliberately under-specified — the design pass happens during the WP, not at draft time. The packet locks behavior, not pixel-level UI.

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

**Engine-wide:**
- ESM only, Node v22+ for tooling
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
  threshold (default per D-LEG-3), the indicator is rendered in a degraded /
  warning visual style.
- The SPA MUST be functional with JavaScript-blocked-but-HTML-shell-served
  for the first paint of the static "PRESS START" CTA. Full attract mode
  requires JS; a static fallback is rendered server-rendered-equivalent.
- Kiosk mode (`?kiosk=1`) MUST hide all chrome, disable any links that
  would navigate away, and respect `prefers-reduced-motion` for the cycling
  animation.

**Locked contract values:**
- Snapshot URL base: `https://<R2-public-host>/legends/v1/` (exact host
  finalized in WP-142 + D-LEG-1)
- Manifest path: `legends/v1/manifest.json`
- Default cycle interval: per D-LEG-2

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
- Any read of `apps/server` HTTP endpoints. Hard rule per D-LEG-1.
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
- `docs/ai/DECISIONS.md` — **modified** — D-LEG-1..D-LEG-5
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
- [ ] `AttractCycler` cycles every N ms (N configurable; default per D-LEG-2)
- [ ] Cycler pauses on hover in non-kiosk mode
- [ ] Cycler ignores hover in kiosk mode (`?kiosk=1`)
- [ ] Cycler respects `prefers-reduced-motion`

### Freshness
- [ ] `FreshnessBadge` renders "Updated <X> ago" using `manifest.generatedAt`
- [ ] Past the staleness threshold (D-LEG-3), the badge renders in a warning style
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

# Step 6 — only files in scope changed
git diff --name-only
# Expected: matches "Files Expected to Change"

# Step 7 — staging deploy smoke test (manual)
node scripts/check-subdomains.mjs --include-planned
# Expected: legends. row turns OK once Pages deploy lands and the entry's
# state is flipped to "live" in a follow-up commit.
```

---

## Decisions to Record (DECISIONS.md)

- **D-LEG-1** — The legends SPA reads from R2 directly and is forbidden from calling the game-server API. Trade-off: locks public scoreboard's blast radius (a viral surge cannot crash the game server) at the cost of cache-driven freshness staleness (mitigated by D-LEG-2 cadence + D-LEG-3 visible staleness UX).
- **D-LEG-2** — Default attract-mode cycle interval: 15 seconds per panel. Trade-off: long enough to read top 10 entries; short enough that a kiosk display feels alive.
- **D-LEG-3** — Stale-snapshot threshold: 30 minutes. Past this, the freshness badge degrades visibly. Reasoning: the publisher's default cadence is 5 min (D-PUB-1); 30 min represents 6 missed cycles, a meaningful failure signal.
- **D-LEG-4** — No auth, no cookies, no localStorage tokens. Public attract board has no concept of a user session. Any future "claim your handle" flow lives in `play.legendary-arena.com`, never here.
- **D-LEG-5** — Kiosk mode is a URL-flag concern only, not a build-time mode. The same artifact serves both ordinary visitors and kiosk displays; no build matrix.

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
- [ ] `docs/ai/DECISIONS.md` updated — D-LEG-1..D-LEG-5 (renumbered)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-143 (or assigned slot) checked off
