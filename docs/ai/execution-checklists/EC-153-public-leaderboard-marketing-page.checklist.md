# EC-153 — Public Leaderboard Marketing-Site Hugo Page (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md`
**Layer:** Cross-repo. Implementation lives in the marketing repo
(`C:\www\legendary-arena-com\`, Hugo + PaperMod). Governance close
lands in this engine-repo via SPEC commit (index rows + STATUS).
Hard-deps: **WP-148 + WP-150 must both be Done on `main`** before
EC-153 execution starts.

## Before Starting

- [ ] WP-148 Done on `main` (engine repo); Render redeploy reflects
      the 7-entry origins array; both new hostnames pass the WP-148
      §Step 7 curl smoke
- [ ] WP-150 Done on `main` (engine repo); both new endpoints
      reachable + return 200 JSON for known input; WP-150 §Step 6
      smoke passed against production
- [ ] Marketing repo `C:\www\legendary-arena-com\` on its own `main`,
      clean, fast-forward synced
- [ ] Marketing repo `hugo --gc --minify` exits 0 from a clean tree
- [ ] **Open Decision lock (session-start):** layout-path choice
      (`layouts/leaderboard/list.html` vs alternate), inline-script
      vs `assets/js/leaderboard.js`, optional static
      `data/leaderboard-themes.json` lookup ship / skip, and any
      nav-menu link addition. Document each lock in the WP body
      amendment.

## Locked Values (do not re-derive)

- **URL path:** `/leaderboard/` (Hugo content slug; baseURL gives
  `https://www.legendary-arena.com/leaderboard/`).
- **Query parameters honored** (closed set):
  - `?themeId=<kebab-case-id>` — theme-grouped view
  - `?view=scheme-mastermind` — reserved placeholder
  - `?limit=<int>` — pagination size (default 25, bounds 1..100)
  - `?offset=<int>` — pagination offset (default 0, bounds 0..10000)
- **Endpoints consumed** (verbatim):
  - `GET https://api.legendary-arena.com/api/leaderboards/top`
  - `GET https://api.legendary-arena.com/api/leaderboards/themes/:themeId`
- **Entry shape rendered:** `PublicLeaderboardEntry` (9 fields:
  `rank`, `replayHash`, `playerDisplayName`, `scenarioKey`,
  `finalScore`, `rawScore`, `parVersion`, `scoringConfigVersion`,
  `createdAt`).
- **Placeholder copy for `?view=scheme-mastermind`:** locked at
  session start to match marketing-repo voice; default candidate is
  `"The scheme-mastermind leaderboard view is coming soon."`.
- **No funding affordance / donate copy in v1** (WP-097 §F G-1..G-7
  per WP-149 §Funding Surface Gate).

## Guardrails

- **Read-only page.** No moves, no auth, no POST / PUT / DELETE.
- **No client-side score derivation.** All values come from the API
  response and render as-is.
- **No localStorage / IndexedDB caching of scores.** Stateless page.
- **Full-sentence error messages** on every fetch failure (network,
  4xx, 5xx). Reuse API's `error` + `message` envelope.
- **No new runtime npm dependency in the marketing repo** (default
  expectation; lock at session start if the executor surfaces a
  justified addition).
- **No engine-repo touch.** EC-153's engine-repo diff is empty
  (governance close only).
- **No change to existing marketing pages** beyond an optional
  nav-menu link addition (executor-locked).
- **No Hugo / PaperMod / Pagefind dependency bumps.**

## Required `// why:` Comments

- The client-side script's `fetch()` block: `// why:` comment
  explaining the cross-origin contract (CORS allowlist from WP-148;
  endpoints from WP-150).
- The error-rendering branch: `// why:` comment explaining the
  full-sentence requirement (consumer-facing surface; no terse
  "Error" / "Failed" allowed per `00.6` Rule 11 / Rule 15).
- The `?view=scheme-mastermind` placeholder branch: `// why:`
  comment explaining the URL-contract reservation (no
  implementation in v1; future WP flips the placeholder to live).
- The pagination-control logic: `// why:` comment explaining the
  WP-115 pagination-bound reuse (1..100 limit, 0..10000 offset)
  rather than client-side re-derivation.

## Files to Produce

In the **marketing repo** (`C:\www\legendary-arena-com\`):

- `content/leaderboard/_index.md` — **new** — section page front-matter
- `layouts/leaderboard/list.html` — **new** — page template (or
  alternate layout path per session-start lock)
- `assets/js/leaderboard.js` OR inline `<script type="module">` in
  the layout — **new** — client-side fetch + render
- `data/leaderboard-themes.json` — **new (optional, executor lock)** —
  static themeId → display name lookup
- Marketing repo's local WORK_INDEX-equivalent — **modified** —
  add WP-149 row per marketing-repo conventions

In **this engine repo** (governance close only, separate SPEC commit
after WP-149 implementation lands in the marketing repo):

- `docs/ai/work-packets/WORK_INDEX.md` — WP-149 row flipped to done
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-153 row flipped
  `Draft` → `Done`
- `docs/ai/STATUS.md` — capability flip

**Explicitly NOT touched** in the engine repo (during EC-153
execution): every path outside the three governance-close files.

## After Completing

- [ ] WP-149 §Verification Steps 1-8 all pass
- [ ] `hugo --gc --minify` exits 0; `public/leaderboard/index.html`
      present in build output
- [ ] Marketing-site deploy pipeline (Cloudflare Pages or whichever
      target) reflects this packet's commit hash
- [ ] All three views render at production URL without DevTools
      console errors
- [ ] CORS smoke (WP-149 §Step 6) succeeds for both endpoints from
      `https://www.legendary-arena.com` Origin
- [ ] Marketing-repo Pagefind search index build still exits 0
- [ ] Engine-repo `git diff --stat` from main returns only the three
      governance-close files
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-149 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-153 `Draft` → `Done`

## Common Failure Smells

- **CORS failure in browser DevTools** despite WP-148 being Done —
  Render redeploy hasn't picked up the new origins; check the
  most-recent successful Render deploy hash matches WP-148's commit.
- **Theme view 404s for every themeId** — WP-150's
  `getScenarioKeysForTheme` injection wasn't wired in `server.mjs`,
  or the themeId-mapping rule disagrees with the registry's actual
  scenarioKey grammar.
- **`scheme-mastermind` placeholder copy diverges from the
  marketing-repo voice** — the executor shipped placeholder copy
  without operator review; the copy lock belongs in the EC
  amendment at session start, not invented mid-execution.
- **Static `data/leaderboard-themes.json` lookup goes stale** — the
  executor shipped the optional lookup without committing to a
  refresh process. If shipped, the EC amendment must document the
  refresh trigger (e.g., "regenerate after any WP that adds a new
  theme to the registry").
- **Pagination request emits `limit=200`** — client-side validation
  must reject out-of-range values per WP-115 bounds before fetch,
  not rely on the server's 400 response (the server's full-sentence
  error is the fallback, not the primary UX).
- **The page indexes scores into Pagefind** — Pagefind should
  exclude the leaderboard route (scores are dynamic; indexing them
  at build time bakes stale rankings into search). The executor
  must confirm the `_index.md` front-matter excludes the page from
  Pagefind, or that Pagefind's existing config skips routes whose
  HTML body has no static scores.
