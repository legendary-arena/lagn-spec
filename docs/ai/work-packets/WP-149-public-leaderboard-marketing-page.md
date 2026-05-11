# WP-149 — Public Leaderboard — Marketing-Site Hugo Page

**Status:** Drafted (BLOCKED on WP-148 + WP-150)
**Primary Layer:** Cross-repo — implementation lives in the marketing
repo (`C:\www\legendary-arena-com\`, a Hugo + PaperMod site at
`https://www.legendary-arena.com/`). Governance and the WP / EC pair
live in this engine-repo ledger because the surfaces it consumes
(`api.legendary-arena.com/api/leaderboards/*`) are governed here.
**Dependencies:** WP-148 (server CORS allowlist for `legendary-arena.com`
+ `www.legendary-arena.com`); WP-150 (theme + global Top-N aggregation
endpoints); WP-055 (`ThemeDefinition.themeId` schema).

---

## Session Context

The marketing-site Hugo bundle at `legendary-arena.com` does not yet
render a public leaderboard surface. WP-149 introduces three
read-only views consuming endpoints exposed by `apps/server` (the
engine repo's game-server). The page itself is static-generated HTML;
data is fetched at page-view time via the browser's `fetch()` against
`api.legendary-arena.com/api/leaderboards/*`.

This is the first cross-repo content surface for public leaderboards.
The marketing repo's existing Hugo conventions (PaperMod theme,
Pagefind search, layouts under `layouts/`, content under `content/`)
are the load-bearing baseline; WP-149 extends them rather than
introducing a new content framework.

---

## Goal

After this packet, `https://legendary-arena.com/leaderboard/` (with
`https://www.legendary-arena.com/leaderboard/` as the canonical) renders
a static-generated public-leaderboard page that fetches three views
from `api.legendary-arena.com`:

1. **Top-N global PAR** — default view; lowest `final_score` entries
   across all PAR-published scenarios.
2. **Theme score** — when the URL carries `?themeId=<kebab-case-id>`,
   shows the theme-grouped leaderboard from WP-150's
   `/api/leaderboards/themes/:themeId` endpoint.
3. **Scheme-mastermind score** — when the URL carries
   `?view=scheme-mastermind`, the page renders a "coming soon"
   placeholder with the URL contract reserved. No implementation in
   v1; the URL contract is locked so the future WP can flip the
   placeholder to live without a route migration.

The page renders client-side from JSON, surfaces full-sentence error
messages on fetch failure, and never re-derives any score field or
PAR value — every value comes directly from the API response.

---

## Assumes

- WP-148 is on `main` and Render has redeployed with the 7-entry
  origins array including `https://legendary-arena.com` and
  `https://www.legendary-arena.com`. Verified by the WP-148 §Step 7
  curl smoke before WP-149 execution begins.
- WP-150 is on `main` and the two new endpoints
  `/api/leaderboards/themes/:themeId` and `/api/leaderboards/top` are
  reachable. Verified by the WP-150 §Step 6 endpoint smoke before
  WP-149 execution begins.
- WP-055 is on `main` — `ThemeDefinition.themeId` is the canonical
  kebab-case identifier the URL query parameter references.
- The marketing repo at `C:\www\legendary-arena-com\` is on its own
  `main` and is in a clean state (operator-verified at WP-149
  execution-session start). The Hugo build (`hugo` invoked from the
  marketing-repo root) exits 0 before WP-149 touches anything.
- The marketing repo's existing PaperMod theme configuration in
  `hugo.toml` is unchanged; WP-149 adds new layouts and content
  without modifying theme internals or the base layout chain
  (`layouts/baseof.html`, `layouts/index.html`).
- The marketing repo's existing Pagefind build pipeline does not need
  to index the new leaderboard page (the data is fetched at view
  time; the static page contains no scores in its HTML).

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/work-packets/WP-148-legendary-arena-domain-cors-prep.md` —
  CORS allowlist contract for `legendary-arena.com` + `www`.
- `docs/ai/work-packets/WP-150-leaderboard-theme-and-global-aggregation-endpoints.md`
  — the two endpoints WP-149 consumes (request/response shapes,
  pagination bounds, error envelopes).
- `apps/server/src/leaderboards/leaderboard.types.ts` — the
  `PublicLeaderboardEntry` shape (9 fields) the page renders.
- `packages/registry/src/theme.schema.ts` — `ThemeDefinitionSchema`
  for `themeId` kebab-case constraints.
- The marketing repo's `hugo.toml`, `layouts/baseof.html`, and
  `layouts/index.html` — the existing PaperMod-extended chain.
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — the
  marketing repo is downstream of the server layer; the page is a
  read-only consumer.
- `docs/ai/REFERENCE/00.6-code-style.md` — applies to any JS / TS the
  page emits.
- `.claude/rules/server.md` — the marketing-page does not change
  server behavior, but the cross-origin contract WP-149 relies on is
  the WP-148 / WP-150 product.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Full file contents required for every modified file; no diffs.
- ESM only (any inline / bundled JS uses ESM, not CommonJS).
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- No `Math.random()`; no client-side score derivation; no
  re-implementation of PAR math.
- No persistence touch — the page is fully stateless; no IndexedDB,
  no localStorage caching of scores, no cookies.

**Packet-specific:**
- The page is **read-only**. No moves, no auth, no mutations against
  any backend. All HTTP calls are GET against `/api/leaderboards/*`.
- The page **does not re-derive** any field. `rank`, `finalScore`,
  `rawScore`, `parVersion` etc. come straight from the API response
  and are rendered as-is.
- The page must surface **full-sentence error messages** on fetch
  failure (network error, 4xx, 5xx) — not "Error" or "Failed". The
  error rendering reuses the WP-115 envelope shapes (`error` +
  optional `message`).
- The page does **NOT** implement the scheme-mastermind aggregation.
  It renders a placeholder when `?view=scheme-mastermind` is present
  in the URL, with locked copy: `"The scheme-mastermind leaderboard
  view is coming soon."` (or operator-locked equivalent;
  scheme-mastermind copy is locked at execution to match the
  marketing repo's voice).
- The page must not break the existing marketing-site bundle. The
  Hugo build (`hugo`) and the Pagefind search index build (existing
  pipeline) must continue to exit 0.
- No change to engine repo files. Engine repo work for the surface
  WP-149 consumes is owned by WP-148 + WP-150.
- No new runtime npm dependencies in the marketing repo unless the
  executor surfaces and locks the addition at session start (the
  default expectation is **no new runtime deps** — vanilla
  `fetch()` + DOM manipulation is sufficient).

**Session protocol:**
- If the marketing-repo Hugo bundle has any in-flight WP that touches
  `layouts/` or `content/`, STOP and reconcile before WP-149
  proceeds. Marketing-repo merges are independent of engine-repo
  merges; the executor verifies that the marketing repo's
  `main` is clean and synced before any work.

**Locked contract values:**
- URL path: `/leaderboard/` (Hugo content slug; baseURL combines to
  `https://www.legendary-arena.com/leaderboard/`).
- URL query parameters honored:
  - `?themeId=<kebab-case-id>` — switches to theme-grouped view.
  - `?view=scheme-mastermind` — reserved placeholder.
  - `?limit=<int>` (optional; default 25; respects WP-115
    pagination bounds 1..100).
  - `?offset=<int>` (optional; default 0; respects WP-115
    pagination bounds 0..10000).
- Endpoints consumed (verbatim):
  - `GET https://api.legendary-arena.com/api/leaderboards/top`
  - `GET https://api.legendary-arena.com/api/leaderboards/themes/:themeId`
- No other endpoint is consumed by WP-149.

---

## Debuggability & Diagnostics

```pwsh
# Local Hugo dev server (marketing repo)
cd C:\www\legendary-arena-com
hugo server -D --bind 0.0.0.0 --baseURL "http://localhost:1313/"

# Verify the leaderboard route renders
curl -s http://localhost:1313/leaderboard/ | grep -i "leaderboard"
# Expected: page rendered with leaderboard scaffolding

# Production smoke (post-deploy)
curl -s https://www.legendary-arena.com/leaderboard/ | head -40
curl -s "https://www.legendary-arena.com/leaderboard/?themeId=<known-themeId>" | head -40
curl -s "https://www.legendary-arena.com/leaderboard/?view=scheme-mastermind" | head -40
```

Browser DevTools console expectations: no uncaught errors; one
`fetch()` against `/api/leaderboards/top` or
`/api/leaderboards/themes/:themeId`; response cached per the
`Cache-Control: no-store` header (no caching).

---

## Scope (In)

### A) Marketing-repo content

- **New:** `C:\www\legendary-arena-com\content\leaderboard\_index.md`
  — the section page front-matter (title, layout reference,
  `weight` for nav-menu ordering if applicable). Body is minimal;
  the page is rendered by a custom layout that fetches data
  client-side.

### B) Marketing-repo layouts

- **New:** `C:\www\legendary-arena-com\layouts\leaderboard\list.html`
  (or equivalent Hugo path per the executor's lock at session
  start). The template renders the page chrome (header, footer,
  view selector tabs for global / themed / scheme-mastermind) and
  embeds the client-side script.

### C) Marketing-repo client-side script

- **New:** an inline `<script type="module">` block (preferred) or
  a separate `assets/js/leaderboard.js` (if the executor's lock
  chooses external script) — owns the `fetch()` calls, URL-query
  parsing, table rendering, error rendering, and pagination
  controls. ESM, no transpile pipeline required (modern browsers
  only — same baseline as the existing marketing bundle).

### D) Marketing-repo data files (optional)

- **Optional New:** `C:\www\legendary-arena-com\data\leaderboard-themes.json`
  — a static lookup of `themeId → display name` so the page can
  show a human-readable theme title without a second API call.
  The executor decides at session start whether this static lookup
  is justified vs. expecting the user to know the themeId. If the
  static lookup is shipped, the executor commits to a refresh
  process (manual re-export from `data/metadata/themes/index.json`
  or equivalent registry source) and documents it in the WP body
  amendment.

### E) No engine-repo changes

WP-149's execution-time diff against the engine repo is empty. The
WP / EC files in `docs/ai/work-packets/` and
`docs/ai/execution-checklists/` were already merged during the
WP-148 + WP-150 + WP-149 SPEC drafting commit.

---

## Out of Scope

- **No implementation of scheme-mastermind aggregation.** The
  `?view=scheme-mastermind` URL contract is reserved; the page
  renders a placeholder only. A future WP adds the scheme-mastermind
  endpoint(s) (engine repo) and flips the placeholder to live
  (marketing repo) — neither half is WP-149.
- **No engine repo change.** All server-side surfaces are owned by
  WP-148 (CORS) and WP-150 (aggregation endpoints).
- **No new auth / handle / session surface.** The page is fully
  anonymous; no login, no profile display.
- **No localStorage / IndexedDB caching of scores.** Every page-view
  fetches fresh data; `Cache-Control: no-store` from the API is
  respected.
- **No PostgreSQL or Redis touch from the marketing repo.** The
  marketing repo is fully static; only the browser-side `fetch()` to
  `api.legendary-arena.com` reaches the database (transitively, via
  WP-150's logic surface).
- **No change to the existing marketing-site bundle's nav, header,
  footer, or other pages** beyond adding a leaderboard link to the
  nav (executor-locked at session start; may stay off-nav for v1).
- **No marketing-repo dependency upgrades** (Hugo, PaperMod theme,
  Pagefind, Node, npm).

---

## Files Expected to Change

In the **marketing repo** (`C:\www\legendary-arena-com\`):

- `content/leaderboard/_index.md` — **new** — page front-matter
- `layouts/leaderboard/list.html` — **new** — page template (or
  equivalent layout path; executor locks at session start)
- `assets/js/leaderboard.js` OR an inline `<script type="module">`
  in the layout — **new** — client-side fetch + render
- `data/leaderboard-themes.json` — **new (optional, executor lock)** —
  static themeId → display name lookup
- Marketing repo's `WORK_INDEX`-equivalent file (whatever local
  governance ledger the marketing repo maintains) — **modified** —
  add WP-149 row per marketing-repo conventions

In **this engine repo** (drafting commit only; execution diff is
empty):

- `docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md` —
  **new** — this file
- `docs/ai/execution-checklists/EC-153-public-leaderboard-marketing-page.checklist.md`
  — **new** — paired EC
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-149 row
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-153 row

At WP-149 execution close (separate session, in the marketing repo):

- Flip WORK_INDEX.md WP-149 row to `[x]` with completion date
  (engine-repo SPEC commit — the execution work itself doesn't land
  in this repo, but the governance close does).

---

## Acceptance Criteria

### A) Page reachability + structure
- [ ] `https://www.legendary-arena.com/leaderboard/` returns 200
      from Cloudflare Pages (or whichever Hugo-deploy target the
      marketing site uses) with valid HTML.
- [ ] The page renders the global Top-N view on default load
      (no query params).
- [ ] `?themeId=<known-themeId>` switches to the theme-grouped view
      and renders the response from
      `/api/leaderboards/themes/:themeId`.
- [ ] `?themeId=<unknown-themeId>` surfaces a full-sentence error
      message (e.g., "The leaderboard for theme `<id>` was not
      found.").
- [ ] `?view=scheme-mastermind` renders the locked placeholder copy.

### B) Data fidelity
- [ ] Every value rendered (rank, replayHash, playerDisplayName,
      finalScore, rawScore, parVersion, scoringConfigVersion,
      createdAt, scenarioKey) comes straight from the API response;
      no client-side derivation.
- [ ] Pagination controls (next / prev) respect WP-115 bounds
      (`limit` 1..100, `offset` 0..10000) and surface a
      full-sentence error on out-of-range input.

### C) Error handling
- [ ] Network failures (offline, DNS failure) surface a
      full-sentence error message rather than a console-only error.
- [ ] 4xx / 5xx responses surface the API's `error` + `message`
      envelope in a full-sentence form.
- [ ] The page never crashes the browser tab; all `fetch()` rejections
      are caught.

### D) CORS + cross-origin
- [ ] `fetch()` from `https://legendary-arena.com` and from
      `https://www.legendary-arena.com` both succeed against
      `https://api.legendary-arena.com/api/leaderboards/top` and
      `/api/leaderboards/themes/:themeId` (relies on WP-148's
      allowlist).

### E) Scope enforcement
- [ ] No engine-repo file is modified at WP-149 execution time.
- [ ] No marketing-repo file outside the WP-149 allowlist is modified.
- [ ] The Hugo build and Pagefind index build both exit 0.

---

## Verification Steps

```pwsh
# Step 1 — marketing repo Hugo build (from marketing repo root)
cd C:\www\legendary-arena-com
hugo --gc --minify
# Expected: exits 0; public/ contains a fresh build

# Step 2 — leaderboard page present in build output
Test-Path "public\leaderboard\index.html"
# Expected: True

# Step 3 — page contains the expected scaffolding (titles, view tabs)
Select-String -Path "public\leaderboard\index.html" -Pattern "leaderboard|Top.*PAR|Theme"
# Expected: at least 3 matches

# Step 4 — local Hugo dev server smoke
hugo server -D
# Manually browse:
#   http://localhost:1313/leaderboard/
#   http://localhost:1313/leaderboard/?themeId=<known-themeId>
#   http://localhost:1313/leaderboard/?view=scheme-mastermind
# All three render without uncaught errors in DevTools console.

# Step 5 — Production smoke (post-deploy)
curl -s https://www.legendary-arena.com/leaderboard/ | head -40
curl -s -I https://www.legendary-arena.com/leaderboard/
# Expected: HTTP/200; content-type: text/html

# Step 6 — CORS smoke from production page (DevTools console)
# fetch('https://api.legendary-arena.com/api/leaderboards/top?limit=10')
#   .then(r => r.json()).then(console.log)
# Expected: response body printed; no CORS error

# Step 7 — exact-set scope enforcement (marketing repo)
cd C:\www\legendary-arena-com
git diff --name-only main..HEAD | Sort-Object
# Expected: only the WP-149 allowlist files (content/leaderboard/_index.md,
# layouts/leaderboard/list.html, optional assets/js/leaderboard.js,
# optional data/leaderboard-themes.json, marketing-repo WORK_INDEX)

# Step 8 — engine repo unchanged (this repo)
cd C:\pcloud\BB\DEV\legendary-arena
git diff --stat main..HEAD
# Expected (at WP-149 execution): empty; engine repo not touched.
```

---

## Vision Alignment

WP-149 is the user-visible surface of the public-leaderboard
capability. It touches §3 (player identity — display names are
already-public account fields exposed via `PublicLeaderboardEntry`),
§10 (content semantics — the leaderboard renders score values,
which are content-derived rankings), §22 (replay verification —
each entry exposes `replayHash` as a permalink to the underlying
replay), and §24 (skill measurement — PAR-relative rankings are
the operative skill comparison surface).

- **Vision clauses touched:** §3, §10, §22, §24.
- **Conflict assertion:** No conflict: this WP preserves all touched
  clauses. The page renders existing API output without re-derivation;
  it does not invent score axes or modify identity semantics.
- **Non-Goal proximity check:** none of NG-1..NG-7 are crossed. The
  page is anonymous + read-only + free; no paid features, no
  persuasive monetization copy, no competitive ladder claims beyond
  the existing PAR-rank semantics. The page's URL contract reserves
  `?view=scheme-mastermind` but ships no implementation, no copy
  promising future paid features, and no engagement-loop tactics.
- **Determinism preservation:** the page renders API responses as-is.
  All scoring / RNG / replay determinism is preserved upstream
  (WP-054 + WP-150 + the engine's PAR pipeline). The page itself
  performs no calculation that could drift from server truth.

---

## Funding Surface Gate

**Trigger fired:** §20.1 lists "Tournament-specific funding-channel
integrations" and "user-visible copy referencing 'donate', 'support
tournaments', 'tournament funding', or equivalent terms — as part of
a proposed or implemented user interaction" as trigger surfaces. The
public leaderboard is the canonical surface where future
tournament-funding affordances would land (a "Sponsor a Tournament"
button next to a ranking, etc.). WP-149 ships **no funding affordance
in v1**, but §20 requires the surface inventory to declare so
explicitly.

- **Surface inventory:** WP-149 ships the public leaderboard page at
  `/leaderboard/`. It contains:
  - **WP-097 §A (global navigation funding affordances):** N/A —
    WP-149 does not modify the marketing site's global nav. A
    leaderboard nav link addition is executor-locked at session
    start and, if added, contains no funding text.
  - **WP-097 §B (registry viewer funding affordances):** N/A — WP-149
    is not the registry viewer.
  - **WP-097 §C (user profile funding attribution):** N/A — the page
    is anonymous; no profile attribution surface.
- **G-1 through G-7 disposition** (per WP-097 §F):
  - **G-1 (no funding text in v1 unless WP-097 §A authorizes):** PASS —
    zero funding text in v1.
  - **G-2 (donate links must point to WP-097-authorized destinations):**
    N/A — no donate links present.
  - **G-3 (no persuasive copy):** PASS — page copy describes only what
    the rankings are, no persuasion.
  - **G-4 (no implied financial obligation):** PASS — page is free,
    anonymous, and stateless.
  - **G-5 (tournament-funding integration requires WP-097 §F audit):**
    N/A — no tournament-funding integration.
  - **G-6 (user-visible donate copy requires Public Blurb verbatim
    OR D-NNNN carve-out):** PASS — no donate copy.
  - **G-7 (no orphan funding surfaces; every funding affordance
    cites its WP-097 authorization):** PASS — no funding affordances
    to cite.
- **Copy deferral declaration:** N/A — no funding copy in v1; not
  applicable.
- **Authority citation:** `WP-097`, `D-9701`, `D-9801`.

---

## Lint Gate Self-Review

Per `00.3-prompt-lint-checklist.md`:

- §1 Structure: PASS — all 10 required sections present.
- §2 Constraints: PASS — engine-wide block; packet-specific block
  (read-only, no re-derivation, full-sentence errors, no
  scheme-mastermind impl, no engine-repo touch, no new deps);
  session protocol (stop-and-ask on dirty marketing-repo);
  locked contract values (URL path, query params, endpoint
  paths).
- §3 Assumes: PASS — WP-148, WP-150, WP-055 cited; marketing repo
  clean-state assumption explicit; PaperMod / Pagefind baseline
  cited; Hugo build pre-condition cited.
- §4 Context: PASS — WP-148 + WP-150 + WP-055 + `leaderboard.types.ts`
  + `theme.schema.ts` + marketing repo Hugo / layout files +
  ARCHITECTURE.md Layer Boundary cited.
- §5 Files: PASS — every file in both repos enumerated; cross-repo
  split documented; new vs modified marked.
- §6 Naming: PASS — `themeId` (kebab-case per WP-055), `scenarioKey`,
  `replayHash`, `playerDisplayName`, `finalScore`, `rawScore`,
  `parVersion`, `scoringConfigVersion`, `createdAt`, `rank` all
  match canonical names; no abbreviations introduced.
- §7 Dependencies: PASS — default expectation is no new runtime
  deps; explicit forbidden-package mention not required.
- §8 Boundaries: PASS — marketing-repo work doesn't violate any
  engine-repo layer boundary; the page is a read-only HTTP
  consumer.
- §9 Windows: PASS — Verification Steps use `pwsh` and `\` paths.
- §10 Env vars: PASS — no new env vars.
- §11 Auth: PASS — explicit anonymous / guest posture; the page
  performs no auth and consumes only guest endpoints.
- §12 Tests: N/A — Hugo content + layout work has no `node:test`
  surface; build-time validation is `hugo --gc --minify` exits
  0. Justification: §12 trigger condition is "this packet produces
  tests"; WP-149 produces no test files, so §12 doesn't apply.
  The marketing-site Lighthouse / build-time gates remain
  unchanged.
- §13 Commands: PASS — `hugo` / `pwsh` / `curl` commands exact.
- §14 Acceptance Criteria: PASS — 14 binary, observable items
  spanning page reachability, data fidelity, error handling, CORS,
  scope.
- §15 Definition of Done: PASS — STATUS.md / DECISIONS.md /
  WORK_INDEX.md / scope-boundary check all included below.
- §16 Code style: PASS — script discipline cited; no
  `.reduce()` over branching; full-sentence error messages
  required; no abbreviations.
- §17 Vision Alignment: PASS — §3 / §10 / §22 / §24 cited with
  no-conflict + determinism-preservation lines.
- §18 Prose-vs-grep: PASS — verification steps grep on positive
  page-content markers (`leaderboard|Top.*PAR|Theme`); no
  forbidden-token enumeration adjacent to literal grep.
- §19 Bridge-vs-HEAD: N/A — this is the WP itself.
- §20 Funding Surface Gate: PASS — section above declares the
  trigger fired (public leaderboard is a §20.1 funding-adjacent
  surface), inventories the surfaces, dispositions G-1 through
  G-7 (all PASS / N/A with rationale), declares no copy deferral
  needed (zero funding copy in v1), cites WP-097 / D-9701 /
  D-9801.
- §21 API Catalog: N/A — WP-149 adds no HTTP endpoints to
  `apps/server` and modifies no `apps/server/src/**` library
  functions. The endpoints WP-149 consumes are added by WP-150,
  which owns its own catalog rows. Justification: per §21.1
  trigger conditions, marketing-repo Hugo content + layouts +
  client-side scripts don't add / modify / remove engine-repo
  endpoints; the consumed endpoints are catalogued by their
  authorizing WP.

---

## Definition of Done

This packet is complete when ALL of the following are true.

### Local Validation (this session, in the marketing repo)
- [ ] All acceptance criteria above pass.
- [ ] `hugo --gc --minify` exits 0; `public/leaderboard/index.html`
      exists.
- [ ] Local dev server smoke (Step 4) renders all three views without
      DevTools console errors.

### Deployment Validation (post-merge, post-redeploy)
- [ ] Marketing-site deploy pipeline (Cloudflare Pages or equivalent)
      reflects this packet's commit hash and the page is reachable at
      `https://www.legendary-arena.com/leaderboard/`.
- [ ] CORS smoke (Step 6) succeeds for both endpoints from the
      production origin.

### Documentation & Governance Updates
- [ ] `docs/ai/STATUS.md` updated — capability: public-leaderboard
      page live on the marketing site; CORS + aggregation endpoints
      wired end-to-end.
- [ ] `docs/ai/DECISIONS.md` updated only if WP-149 surfaces locks
      worth durable rationale (e.g., the static themeId → display
      name lookup refresh policy). Default expectation: zero new
      D-NNNNN; the WP-150 D-150NN entries already cover the
      backend contract.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-149 checked off
      with execution date (governance close via engine-repo SPEC
      commit).
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-153 row flipped
      `Draft` → `Done`.
- [ ] Marketing-repo `WORK_INDEX`-equivalent ledger updated per
      marketing-repo conventions.
- [ ] No engine-repo file outside the four governance rows is
      modified at WP-149 execution time.
