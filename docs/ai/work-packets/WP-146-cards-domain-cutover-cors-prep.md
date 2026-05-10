# WP-146 — `cards.legendary-arena.com` Cutover Prep — Server CORS

**Status:** Ready
**Primary Layer:** Server (`apps/server/**`)
**Dependencies:** None (no engine, registry, preplan, or arena-client touch)

---

## Session Context

WP-007a (`play.legendary-arena.com` deploy) established the engine-side
pattern for adding a new `legendary-arena.com` subdomain to the
boardgame.io `Server({ origins: [...] })` allowlist via an EC-scoped
single-file edit (EC-147 precedent), with the `domains.json` planned →
live state flip handled by a separate `SPEC:` commit at cutover lock
time. This packet repeats that pattern for the registry-viewer hostname
migration `cards.barefootbetters.com` → `cards.legendary-arena.com`.

---

## Goal

After this packet, the production game-server CORS allowlist accepts
requests from `https://cards.legendary-arena.com` so the registry-viewer
SPA continues to authenticate cross-origin against
`api.legendary-arena.com` once the Cloudflare Pages custom-domain swap
completes. The existing `https://cards.barefootbetters.com` entry is
retained for the dual-running window so neither hostname breaks during
the operator-driven Cloudflare Pages dashboard cutover.

---

## Assumes

- EC-147 merged on `main` (`8ff139a` or successor) — the four-entry
  `Server({ origins: [...] })` literal array is in place
- `apps/server/src/server.mjs` `origins` array currently contains
  exactly: `https://play.legendary-arena.com`,
  `https://legendary-arena-play.pages.dev`,
  `https://cards.barefootbetters.com`, `http://localhost:5173`
- `pnpm install --frozen-lockfile && pnpm -r build` exits 0 from a clean tree
- `pnpm --filter @legendary-arena/server test` passes the EC-147 baseline
  (250 / 184 pass / 66 skipped requires-test-database / 0 fail)
- The Cloudflare Pages dashboard cutover (detach
  `cards.barefootbetters.com`, attach `cards.legendary-arena.com`) is
  operator-handled, out-of-band, and **not** part of this packet's
  in-repo scope. This packet must land before that cutover so the
  game-server is ready for the new hostname when the swap completes.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms
  `apps/server/**` is the wiring layer that owns CORS allowlist
  configuration; engine, registry, preplan, and UI packages are
  off-limits in this packet.
- `apps/server/src/server.mjs` lines 220-247 — current `Server({...})`
  block including the `// why:` comment block and the four-entry
  `origins` literal.
- `docs/ops/domains.json` — confirms `cards.legendary-arena.com` entry
  is `state: "planned"` (the cutover smoke target).
- `docs/ops/DOMAINS.md §Cutover order of operations §3` — the
  documented `cards.` migration plan; this packet is the engine-side
  preparatory commit that must land before the operator runs the CF
  Pages dashboard swap.
- `docs/ai/execution-checklists/EC-147-server-cors-allowlist-play.checklist.md`
  — direct precedent for this packet's structure and grep-gate
  discipline.
- `docs/ai/REFERENCE/00.6-code-style.md` Rule 7 (literal arrays) and
  Rule 6 (`// why:` comments).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never persist `G`, `ctx`, or any runtime state — N/A here (server
  wiring only)
- ESM only, Node v22+ — `apps/server/src/server.mjs` is already ESM
- No database or network access introduced by this change

**Packet-specific:**
- The `Server({ origins: [...] })` array must remain a literal array
  (code-style Rule 7); no env-var-driven origin lists
- Existing `https://cards.barefootbetters.com` entry must be **preserved
  byte-identical** during the dual-running window. Removal is owned by
  a separate post-cutover SPEC commit, not this packet.
- Existing `https://play.legendary-arena.com` and
  `https://legendary-arena-play.pages.dev` entries must remain
  byte-identical (EC-147 contract preserved)
- Existing `origins` array entries must retain their relative order;
  the new `https://cards.legendary-arena.com` entry is inserted
  adjacent to the existing `https://cards.barefootbetters.com` entry
  only. No other entries are reordered. Audit-trail clarity: any
  reorder of the four pre-existing entries is a scope violation
  even if the resulting set is identical.
- No change to `apps/server/src/server.mjs` outside the
  `Server({ origins: [...] })` array and its preceding `// why:`
  comment block
- No change to `packages/`, `apps/arena-client/`,
  `apps/registry-viewer/`, `apps/replay-producer/`, `apps/wiki-viewer/`,
  `data/`, `scripts/`, root `package.json`, `pnpm-lock.yaml`, root
  `tsconfig.json`, `render.yaml`
- No change to `docs/ops/domains.json` (the planned → live flip is a
  separate SPEC commit at cutover lock time, per WP-007a precedent)

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the
  human before proceeding — never guess or invent field names, type
  shapes, or file paths

---

## Debuggability & Diagnostics

This packet adds one origin string to a literal array consumed by
boardgame.io's `Server({ origins })` option. Behavior is observable
externally via a CORS preflight from the new hostname:

```pwsh
curl -I -H "Origin: https://cards.legendary-arena.com" https://api.legendary-arena.com/games/legendary-arena
# Expected post-deploy: HTTP/200 with Access-Control-Allow-Origin reflecting the request Origin
```

No `G` or `ctx` mutation. No new persistence surface. No new test files
required — the existing `apps/server/` test baseline must remain
unchanged (250 / 184 / 66 / 0).

---

## Scope (In)

### A) `apps/server/src/server.mjs` — single-file edit

- **Modified:** add one entry to the `Server({ origins: [...] })`
  literal array: `'https://cards.legendary-arena.com'`. Insert it
  adjacent to the existing `'https://cards.barefootbetters.com'` entry
  so both `cards.*` hostnames sit together visually in the array.
- **Modified:** expand the existing `// why:` comment block immediately
  preceding the `origins` array to enumerate the new entry's purpose
  (registry-viewer SPA at the new `cards.legendary-arena.com`
  hostname) and to record that the legacy `cards.barefootbetters.com`
  entry is retained for the dual-running window during the
  Cloudflare Pages dashboard cutover. Match the existing block's
  bullet style (`//   - <bare-URL> — <purpose>.`) — bare-URL form is
  permitted in comments and matches EC-147 precedent. **Always-on
  invariant:** never use single-quoted form (`'https://...'`) inside
  any `// why:` block — that format is reserved for array entries
  and would inflate Step 3's block-scoped origin count. Where prose
  alone suffices, prefer role-based phrasing ("the registry-viewer
  SPA hostname", "the legacy registry-viewer hostname during
  dual-running") to keep grep gates decoupled from comment text.

### B) Tests

No new test files. The existing `apps/server/` test baseline must
remain `250 / 184 / 66 / 0`.

---

## Out of Scope

- **No `domains.json` flip.** The `cards` row stays at `state: "planned"`
  in this packet. The planned → live flip is a separate SPEC commit
  at cutover lock time (mirrors WP-007a's `2276224` lock commit for
  `play`).
- **No `apps/registry-viewer/CLAUDE.md` URL prose update.** The "Live
  at: https://cards.barefootbetters.com/" lines are retained until
  cutover lock; that prose update is a SPEC commit at lock time.
- **No `.env.example` update.** The `CF_PAGES_URL` reference is
  informational and updated at cutover lock time (SPEC commit).
- **No DOMAINS.md restructuring.** The migration-note block stays in
  place until the cutover completes; flipping prose is a SPEC commit
  at lock time.
- **No Cloudflare Pages dashboard work.** The detach/attach is operator-
  handled, out-of-band, and documented in `docs/ops/DOMAINS.md`
  §Cutover order of operations §3.
- **No removal of `https://cards.barefootbetters.com`.** Owned by a
  separate post-cutover cleanup SPEC commit once smoke-tests confirm
  no traffic remains on the legacy hostname.
- **No render.yaml / Render dashboard change.** Render auto-redeploys
  from `main` after this packet's commit lands.
- **No new runtime npm dependencies.**

---

## Files Expected to Change

- `apps/server/src/server.mjs` — **modified** — one new entry in
  `Server({ origins: [...] })` array; expanded `// why:` comment block
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — add WP-146 row
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — add
  EC-149 row
- `docs/ai/work-packets/WP-146-cards-domain-cutover-cors-prep.md` —
  **new** — this file
- `docs/ai/execution-checklists/EC-149-cards-domain-cutover-cors-prep.checklist.md`
  — **new** — paired execution checklist

No other files may be modified.

---

## Acceptance Criteria

### A) Server CORS allowlist
- [ ] `apps/server/src/server.mjs` `Server({ origins: [...] })` literal
      contains exactly 5 entries: `https://play.legendary-arena.com`,
      `https://legendary-arena-play.pages.dev`,
      `https://cards.barefootbetters.com`,
      `https://cards.legendary-arena.com`,
      `http://localhost:5173`
- [ ] Block-scoped origin count returns exactly 5 (Step 3 regex over
      the `origins: [...]` block; see Verification Steps)
- [ ] Pre-existing four entries retain their relative array order;
      only the new `cards.legendary-arena.com` entry is inserted
      adjacent to `cards.barefootbetters.com`
- [ ] `// why:` comment block above the `origins` array enumerates
      each entry's purpose, including dual-running rationale for the
      two `cards.*` hostnames during the Cloudflare Pages cutover
- [ ] `// why:` comment block contains zero single-quoted origin
      literals (Step 3's block-scoped count must include only true
      array entries, not commented examples)
- [ ] No env-var-driven origin configuration; array remains literal
- [ ] No other change to `apps/server/src/server.mjs`
      (confirmed with `git diff -- apps/server/src/server.mjs`)

### Tests
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with
      baseline `250 / 184 / 66 / 0`

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] `git diff --stat packages/ apps/arena-client/ apps/registry-viewer/
      apps/replay-producer/ apps/wiki-viewer/ data/ scripts/ render.yaml
      docs/ops/domains.json` empty

---

## Verification Steps

```pwsh
# Step 1 — full monorepo build
pnpm install --frozen-lockfile
pnpm -r build
# Expected: exits 0; all packages build clean

# Step 2 — server tests
pnpm --filter @legendary-arena/server test
# Expected: 250 pass, 184 pass / 66 skipped / 0 fail (TEST_DATABASE_URL unset case)

# Step 3 — origins array contains exactly 5 entries (block-scoped, not
# file-wide; immune to URLs that may appear in comments or other code)
$content = Get-Content "apps\server\src\server.mjs" -Raw
$block = [regex]::Match($content, "origins:\s*\[(.*?)\]", "Singleline").Groups[1].Value
([regex]::Matches($block, "'https?://[^']+'")).Count
# Expected: 5

# Step 4a — both cards hostnames present as quoted array entries
Select-String -Path "apps\server\src\server.mjs" -Pattern "^\s*'https://cards\.(legendary-arena|barefootbetters)\.com',?\s*$"
# Expected: exactly 2 matches (one per cards.* hostname; trailing comma optional)

# Step 4b — comment block references both hostnames by role (paraphrased
# prose, never single-quoted to avoid colliding with Step 3's block grep)
Select-String -Path "apps\server\src\server.mjs" -Pattern "registry-viewer|dual-running"
# Expected: at least one match for each role term inside the // why: block

# Step 5 — exact-set enforcement: modified-tracked AND new-untracked files
# (`git diff --name-only` would miss the new WP-146 / EC-149 files; --porcelain
# captures both via the X/Y status columns).
$expected = @(
  'apps/server/src/server.mjs',
  'docs/ai/work-packets/WORK_INDEX.md',
  'docs/ai/execution-checklists/EC_INDEX.md',
  'docs/ai/work-packets/WP-146-cards-domain-cutover-cors-prep.md',
  'docs/ai/execution-checklists/EC-149-cards-domain-cutover-cors-prep.checklist.md'
) | Sort-Object
$actual = (git status --porcelain | ForEach-Object { ($_ -replace '^...', '').Trim() }) | Sort-Object
Compare-Object $expected $actual
# Expected: no output (the two lists are equal); any SideIndicator output is a scope violation

# Step 6 — pnpm-lock.yaml unchanged
git diff --stat pnpm-lock.yaml
# Expected: no output

# Step 7 (post-deploy, after Render auto-redeploys from main) —
# CORS preflight from the new hostname succeeds against api.*.
curl -I -H "Origin: https://cards.legendary-arena.com" https://api.legendary-arena.com/games/legendary-arena
# Expected: HTTP/200 with Access-Control-Allow-Origin set
```

---

## Definition of Done

This packet is complete when ALL of the following are true.

### Local Validation (this session)
- [ ] All acceptance criteria above pass
- [ ] `pnpm install --frozen-lockfile && pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 (baseline
      `250 / 184 / 66 / 0`)
- [ ] Step 3 block-scoped origin count returns 5
- [ ] Step 4a returns exactly 2 quoted-array-entry matches; Step 4b
      surfaces at least one match per role term
- [ ] Step 5 `Compare-Object` returns no output (exact-set
      enforcement: only the five files in `## Files Expected to
      Change` are modified or added; nothing else)
- [ ] `pnpm-lock.yaml` byte-identical to HEAD

### Deployment Validation (post-merge, post-redeploy)
- [ ] After commit + push to `main`, Render auto-redeploys
      `legendary-arena-server` and the latest successful Render
      deploy reflects this packet's commit hash
- [ ] Step 7 preflight curl from `https://cards.legendary-arena.com`
      Origin returns HTTP/200 with `Access-Control-Allow-Origin` set
- [ ] **Cutover sequencing gate (operator):** the Cloudflare Pages
      dashboard custom-domain swap (detach `cards.barefootbetters.com`,
      attach `cards.legendary-arena.com`) is performed only AFTER the
      bullets above are confirmed green. During the swap, both
      hostnames stay reachable in the dual-running window — no 4xx
      observed on either origin against `api.legendary-arena.com`.

### Documentation & Governance Updates
- [ ] `docs/ai/STATUS.md` updated — capability: game-server CORS
      allowlist now accepts the new registry-viewer hostname; cutover
      can proceed at any time
- [ ] `docs/ai/DECISIONS.md` updated — D-14601 (dual-running
      retention of `cards.barefootbetters.com` rationale; mirrors
      WP-007a's dual-listing of play.* + pages.dev)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-146 checked off
      with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-149 row flipped
      `Draft` → `Done`
