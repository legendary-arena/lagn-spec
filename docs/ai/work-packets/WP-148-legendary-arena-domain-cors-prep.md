# WP-148 — `legendary-arena.com` + `www` Cutover Prep — Server CORS

**Status:** Ready
**Primary Layer:** Server (`apps/server/**`)
**Dependencies:** WP-146 (5-entry origins array baseline)

---

## Session Context

WP-146 / EC-149 (`5999d10`, 2026-05-10) added `https://cards.legendary-arena.com`
to the boardgame.io `Server({ origins: [...] })` allowlist via a single-file
edit that mirrored EC-147 / WP-007a precedent. WP-148 repeats that exact
pattern for the marketing-site root hostnames `https://legendary-arena.com`
and `https://www.legendary-arena.com`. The marketing-site Hugo bundle (the
WP-149 page surface) needs cross-origin access to `api.legendary-arena.com`
to render the public leaderboard views; CORS must be in place before WP-149
ships.

---

## Goal

After this packet, the production game-server CORS allowlist accepts
requests from `https://legendary-arena.com` and `https://www.legendary-arena.com`
so the marketing-site Hugo bundle can call `api.legendary-arena.com`
endpoints (notably `/api/leaderboards/*`) cross-origin without browser
preflight rejection. Existing five entries are preserved byte-identical
for the dual-running window; the new entries are inserted adjacent so
the `legendary-arena.com` family sits together visually in the literal
array.

---

## Assumes

- WP-146 / EC-149 merged on `main` (`5999d10` or successor) — the
  five-entry `Server({ origins: [...] })` literal array is in place.
- `apps/server/src/server.mjs` `origins` array currently contains
  exactly: `https://play.legendary-arena.com`,
  `https://legendary-arena-play.pages.dev`,
  `https://cards.barefootbetters.com`, `https://cards.legendary-arena.com`,
  `http://localhost:5173`. Verified 2026-05-11 against
  `origin/main` (`c8237a6`).
- `pnpm install --frozen-lockfile && pnpm -r build` exits 0 from a clean tree.
- `pnpm --filter @legendary-arena/server test` passes the WP-146 / EC-149
  baseline (`250 / 184 pass / 66 skipped requires-test-database / 0 fail`).
- The marketing-site Hugo bundle is deployed at
  `https://legendary-arena.com` (with `https://www.legendary-arena.com`
  as the `www`-canonical alternate per the marketing repo's
  `hugo.toml` `baseURL = "https://www.legendary-arena.com/"`). DNS and
  TLS for both hostnames is operator-handled, out-of-band.
- The marketing-site bundle itself is **not** part of this packet's
  scope (lives in `C:\www\legendary-arena-com`, governed under WP-149
  in this repo's ledger and executed in the marketing repo).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms
  `apps/server/**` is the wiring layer that owns CORS allowlist
  configuration; engine, registry, preplan, and UI packages are
  off-limits in this packet.
- `apps/server/src/server.mjs` lines 224-253 — current `Server({...})`
  block including the `// why:` comment block and the five-entry
  `origins` literal.
- `docs/ai/work-packets/WP-146-cards-domain-cutover-cors-prep.md` — the
  direct precedent. Same single-file edit pattern; same Step 3 block-
  scoped grep gate; same comment-block discipline.
- `docs/ai/execution-checklists/EC-149-cards-domain-cutover-cors-prep.checklist.md`
  — the paired EC for WP-146; EC-151 mirrors its structure.
- `docs/ai/REFERENCE/00.6-code-style.md` Rule 7 (literal arrays) and
  Rule 6 (`// why:` comments).
- `.claude/rules/server.md` — server is a wiring layer only.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Full file contents required for every modified file; no diffs, no
  snippets. Output must be the complete file.
- ESM only, Node v22+ — `apps/server/src/server.mjs` is already ESM.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- No persistence touch — N/A here (server wiring only; no `G` / `ctx`
  involvement).
- No database or network access introduced by this change.

**Packet-specific:**
- The `Server({ origins: [...] })` array must remain a literal array
  (code-style Rule 7); no env-var-driven origin lists.
- Existing five entries must be **preserved byte-identical** during the
  dual-running window. None of the five may be removed, renamed, or
  reordered.
- Existing array entries retain their relative order; the two new
  entries are inserted adjacent to the existing
  `https://play.legendary-arena.com` entry so the
  `legendary-arena.com` family (root + www + play.* + cards.*) sits
  together visually in the array. Audit-trail clarity: any reorder of
  the five pre-existing entries is a scope violation even if the
  resulting set is identical.
- No change to `apps/server/src/server.mjs` outside the
  `Server({ origins: [...] })` array and its preceding `// why:`
  comment block.
- No change to `packages/`, `apps/arena-client/`,
  `apps/registry-viewer/`, `apps/replay-producer/`, `apps/wiki-viewer/`,
  `data/`, `scripts/`, root `package.json`, `pnpm-lock.yaml`, root
  `tsconfig.json`, `render.yaml`, `docs/ops/domains.json`,
  `docs/ops/DOMAINS.md`.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the
  human before proceeding — never guess or invent field names, type
  shapes, or file paths.

**Locked contract values:**
- Origins added (verbatim, no trailing slash, no port):
  - `'https://legendary-arena.com'`
  - `'https://www.legendary-arena.com'`
- Final array length: **7** entries.
- No `domains.json` flip in this packet; that's a separate SPEC commit
  at cutover lock time per WP-007a / WP-146 precedent.

---

## Debuggability & Diagnostics

This packet adds two origin strings to a literal array consumed by
boardgame.io's `Server({ origins })` option. Behavior is observable
externally via a CORS preflight from the new hostnames:

```pwsh
curl -I -H "Origin: https://legendary-arena.com" https://api.legendary-arena.com/api/leaderboards/scenarios
curl -I -H "Origin: https://www.legendary-arena.com" https://api.legendary-arena.com/api/leaderboards/scenarios
# Expected post-deploy: HTTP/200 with Access-Control-Allow-Origin reflecting the request Origin
```

No `G` or `ctx` mutation. No new persistence surface. No new test files
required — the existing `apps/server/` test baseline must remain
unchanged (`250 / 184 / 66 / 0`).

---

## Scope (In)

### A) `apps/server/src/server.mjs` — single-file edit

- **Modified:** add two entries to the `Server({ origins: [...] })`
  literal array: `'https://legendary-arena.com'` and
  `'https://www.legendary-arena.com'`. Insert them adjacent to the
  existing `'https://play.legendary-arena.com'` entry so the
  `legendary-arena.com` family sits together visually.
- **Modified:** expand the existing `// why:` comment block immediately
  preceding the `origins` array to enumerate the new entries' purpose
  (marketing-site Hugo bundle at the root and `www` hostnames, needed
  for the WP-149 public-leaderboard page to call `api.legendary-arena.com`
  cross-origin). Match the existing block's bullet style
  (`//   - <bare-URL> — <purpose>.`) — bare-URL form is permitted in
  comments and matches WP-146 / EC-149 precedent. **Always-on
  invariant:** never use single-quoted form (`'https://...'`) inside
  any `// why:` block — that format is reserved for array entries and
  would inflate Step 3's block-scoped origin count. Where prose alone
  suffices, prefer role-based phrasing ("the marketing-site Hugo
  bundle hostname", "the `www`-canonical alternate") to keep grep
  gates decoupled from comment text.

### B) Tests

No new test files. The existing `apps/server/` test baseline must
remain `250 / 184 / 66 / 0`.

---

## Out of Scope

- **No `domains.json` change.** Marketing-site root hostnames either
  already exist as `live` rows or land separately. This packet does
  not touch `docs/ops/domains.json`.
- **No marketing-site bundle change.** The Hugo bundle work lives in
  `C:\www\legendary-arena-com`, governed under WP-149.
- **No leaderboard endpoint change.** New aggregation endpoints (theme
  grouping, global Top-N PAR) are governed under WP-150.
- **No removal of `https://cards.barefootbetters.com`.** Owned by a
  separate post-cutover cleanup SPEC commit (WP-146 precedent).
- **No render.yaml / Render dashboard change.** Render auto-redeploys
  from `main` after this packet's commit lands.
- **No new runtime npm dependencies.**

---

## Files Expected to Change

- `apps/server/src/server.mjs` — **modified** — two new entries in
  `Server({ origins: [...] })` array; expanded `// why:` comment block
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — add WP-148
  + WP-149 + WP-150 rows (paired drafting commit)
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — add
  EC-151 + EC-152 + EC-153 rows
- `docs/ai/work-packets/WP-148-legendary-arena-domain-cors-prep.md` —
  **new** — this file
- `docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md` —
  **new** — paired marketing-repo WP (governed here)
- `docs/ai/work-packets/WP-150-leaderboard-theme-and-global-aggregation-endpoints.md` —
  **new** — paired engine-repo aggregation WP
- `docs/ai/execution-checklists/EC-151-legendary-arena-domain-cors-prep.checklist.md`
  — **new** — paired EC for this WP
- `docs/ai/execution-checklists/EC-152-leaderboard-theme-and-global-aggregation-endpoints.checklist.md`
  — **new** — paired EC for WP-150
- `docs/ai/execution-checklists/EC-153-public-leaderboard-marketing-page.checklist.md`
  — **new** — paired EC for WP-149

No other files may be modified by WP-148 itself; the WP-149 / WP-150
WP and EC files are listed here because they share the same SPEC
drafting commit per the brief's deliverable list.

---

## Acceptance Criteria

### A) Server CORS allowlist
- [ ] `apps/server/src/server.mjs` `Server({ origins: [...] })` literal
      contains exactly 7 entries:
      `https://play.legendary-arena.com`,
      `https://legendary-arena-play.pages.dev`,
      `https://cards.barefootbetters.com`,
      `https://cards.legendary-arena.com`,
      `https://legendary-arena.com`,
      `https://www.legendary-arena.com`,
      `http://localhost:5173`.
- [ ] Block-scoped origin count returns exactly 7 (Step 3 regex over
      the `origins: [...]` block; see Verification Steps).
- [ ] Pre-existing five entries retain their relative array order;
      only the two new entries are inserted adjacent to
      `https://play.legendary-arena.com`.
- [ ] `// why:` comment block above the `origins` array enumerates
      each entry's purpose, including the marketing-site rationale
      for the new root + www entries.
- [ ] `// why:` comment block contains zero single-quoted origin
      literals (Step 3's block-scoped count must include only true
      array entries, not commented examples).
- [ ] No env-var-driven origin configuration; array remains literal.
- [ ] No other change to `apps/server/src/server.mjs`
      (confirmed with `git diff -- apps/server/src/server.mjs`).

### Tests
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with
      baseline `250 / 184 / 66 / 0`.

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only` plus untracked-file
      audit).
- [ ] `pnpm-lock.yaml` byte-identical to HEAD.
- [ ] `git diff --stat packages/ apps/arena-client/ apps/registry-viewer/
      apps/replay-producer/ apps/wiki-viewer/ data/ scripts/ render.yaml
      docs/ops/domains.json docs/ops/DOMAINS.md` empty.

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

# Step 3 — origins array contains exactly 7 entries (block-scoped, not
# file-wide; immune to URLs that may appear in comments or other code)
$content = Get-Content "apps\server\src\server.mjs" -Raw
$block = [regex]::Match($content, "origins:\s*\[(.*?)\]", "Singleline").Groups[1].Value
([regex]::Matches($block, "'https?://[^']+'")).Count
# Expected: 7

# Step 4a — both new hostnames present as quoted array entries
Select-String -Path "apps\server\src\server.mjs" -Pattern "^\s*'https://(www\.)?legendary-arena\.com',?\s*$"
# Expected: exactly 2 matches (root + www; trailing comma optional)

# Step 4b — comment block references both hostnames by role (paraphrased
# prose, never single-quoted to avoid colliding with Step 3's block grep)
Select-String -Path "apps\server\src\server.mjs" -Pattern "marketing-site|www-canonical|public leaderboard"
# Expected: at least one match for each role term inside the // why: block

# Step 5 — exact-set enforcement: modified-tracked AND new-untracked files
$expected = @(
  'apps/server/src/server.mjs',
  'docs/ai/work-packets/WORK_INDEX.md',
  'docs/ai/execution-checklists/EC_INDEX.md',
  'docs/ai/work-packets/WP-148-legendary-arena-domain-cors-prep.md',
  'docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md',
  'docs/ai/work-packets/WP-150-leaderboard-theme-and-global-aggregation-endpoints.md',
  'docs/ai/execution-checklists/EC-151-legendary-arena-domain-cors-prep.checklist.md',
  'docs/ai/execution-checklists/EC-152-leaderboard-theme-and-global-aggregation-endpoints.checklist.md',
  'docs/ai/execution-checklists/EC-153-public-leaderboard-marketing-page.checklist.md'
) | Sort-Object
$actual = (git status --porcelain | ForEach-Object { ($_ -replace '^...', '').Trim() }) | Sort-Object
Compare-Object $expected $actual
# Expected at WP-148 execution: only the first three files in the list
# (server.mjs + the two indices) appear in `git status --porcelain` —
# the remaining six WP/EC files are already on main from the SPEC
# drafting commit and are not part of WP-148's execution diff.

# Step 6 — pnpm-lock.yaml unchanged
git diff --stat pnpm-lock.yaml
# Expected: no output

# Step 7 (post-deploy, after Render auto-redeploys from main) —
# CORS preflight from the new hostnames succeeds against api.*.
curl -I -H "Origin: https://legendary-arena.com" https://api.legendary-arena.com/api/leaderboards/scenarios
curl -I -H "Origin: https://www.legendary-arena.com" https://api.legendary-arena.com/api/leaderboards/scenarios
# Expected: HTTP/200 with Access-Control-Allow-Origin set on both
```

---

## Vision Alignment

WP-148 touches §10 surfaces (the marketing-site is a content-semantic
surface for the public leaderboard, which the leaderboard views
themselves render under WP-149) and §22 / §24 indirectly (it
unblocks the path to public leaderboard exposure, but locks no
scoring / replay / RNG / simulation logic itself).

- **Vision clauses touched:** §10, §22 (indirect), §24 (indirect).
- **Conflict assertion:** No conflict: this WP preserves all touched
  clauses. CORS is a transport-layer admission control, not a content
  or scoring change.
- **Non-Goal proximity check:** none of NG-1..NG-7 are crossed. No
  monetization surface, no paid copy, no persuasive copy, no
  competitive leaderboard claims (those land under WP-149).
- **Determinism preservation:** N/A — this WP makes no change to
  scoring, replay, RNG, simulation, or any deterministic surface.

---

## Funding Surface Gate

**N/A** — WP-148 is a server-layer CORS allowlist edit. No global
navigation funding affordances; no registry-viewer funding
affordances; no profile / account funding attribution surfaces; no
tournament-funding-channel integration; no user-visible copy
referencing donate / supporter terms is added or proposed. WP-149
(marketing-site page) is the surface where any future funding-copy
question would be evaluated; WP-148 is purely transport admission.

---

## Lint Gate Self-Review

Per `00.3-prompt-lint-checklist.md`:

- §1 Structure: PASS — Goal / Assumes / Context / Scope (In) /
  Out of Scope / Files Expected to Change / Non-Negotiable
  Constraints / Acceptance Criteria / Verification Steps /
  Definition of Done all present and non-empty.
- §2 Constraints: PASS — engine-wide block (full file contents,
  ESM, Node v22+, code-style citation, persistence N/A);
  packet-specific block (literal array; byte-identical preservation;
  scope locks); session protocol (stop-and-ask); locked contract
  values (verbatim origins + final length).
- §3 Assumes: PASS — WP-146 dependency cited; current array contents
  enumerated verbatim; baseline test counts cited; out-of-band DNS
  / TLS / marketing-site bundle dependencies named.
- §4 Context: PASS — ARCHITECTURE.md Layer Boundary section,
  server.mjs line range, WP-146 + EC-149 precedent, code-style
  rules cited.
- §5 Files: PASS — every file enumerated with new/modified marker
  and one-line description; no ambiguous "update this section"
  language.
- §6 Naming: PASS — no canonical-field-name conflicts (CORS is not
  a 00.2 surface); WP and EC numbers correctly spelled.
- §7 Dependencies: PASS — no new npm dependencies; explicit
  forbidden-package exclusion N/A (none used).
- §8 Boundaries: PASS — server-only change; layer boundary preserved;
  no PostgreSQL / WebSocket / G mutation involved.
- §9 Windows: PASS — Verification Steps use `pwsh` and `\` separators.
- §10 Env vars: PASS — no env vars introduced.
- §11 Auth: N/A — packet does not touch authentication. CORS
  admission is independent of auth-token validation.
- §12 Tests: N/A — no new tests added; existing baseline preserved.
- §13 Commands: PASS — `pnpm` / `pwsh` commands exact; expected
  output shown inline.
- §14 Acceptance Criteria: PASS — 11 binary, observable items
  spanning array shape, comment block, scope, tests, and
  pnpm-lock.
- §15 Definition of Done: PASS — STATUS.md / DECISIONS.md (if any) /
  WORK_INDEX.md / scope-boundary check all included below.
- §16 Code style: PASS — comment-block edits follow Rule 6 / Rule 7;
  no abstraction added; no functions added.
- §17 Vision Alignment: PASS — §10 / §22 / §24 cited with
  no-conflict + N/A determinism (single-line section above).
- §18 Prose-vs-grep: PASS — Step 4b paraphrases the role
  ("marketing-site", "www-canonical") rather than echoing
  forbidden-by-Step-3 single-quoted URL literals. Step 4a's pattern
  is positively scoped to quoted entries with surrounding regex
  anchors, not a literal-string scan that adjacent prose could
  trip.
- §19 Bridge-vs-HEAD: N/A — this packet is the WP itself, not a
  repo-state-summarizing artifact.
- §20 Funding Surface Gate: N/A — section above explains why none of
  the §20.1 trigger surfaces (global nav funding affordances,
  registry-viewer funding affordances, profile/account funding,
  tournament-funding integration, user-visible donate copy) are
  touched.
- §21 API Catalog: N/A — CORS allowlist is admission policy, not an
  HTTP endpoint addition / modification / removal / status change /
  library-only function change. The catalog at
  `docs/ai/REFERENCE/api-endpoints.md` does not have rows for CORS
  allowlist entries; no row needs updating. Justification: per the
  §21.1 trigger conditions, CORS array edits do not match any
  trigger surface.

---

## Definition of Done

This packet is complete when ALL of the following are true.

### Local Validation (this session)
- [ ] All acceptance criteria above pass.
- [ ] `pnpm install --frozen-lockfile && pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
      (baseline `250 / 184 / 66 / 0`).
- [ ] Step 3 block-scoped origin count returns 7.
- [ ] Step 4a returns exactly 2 quoted-array-entry matches; Step 4b
      surfaces at least one match per role term.
- [ ] Step 5 `Compare-Object` returns no output (exact-set
      enforcement; only the WP-148 execution-time files in
      `## Files Expected to Change` are modified).
- [ ] `pnpm-lock.yaml` byte-identical to HEAD.

### Deployment Validation (post-merge, post-redeploy)
- [ ] After commit + push to `main`, Render auto-redeploys
      `legendary-arena-server` and the latest successful Render
      deploy reflects this packet's commit hash.
- [ ] Step 7 preflight curls from both new hostnames return HTTP/200
      with `Access-Control-Allow-Origin` set.

### Documentation & Governance Updates
- [ ] `docs/ai/STATUS.md` updated — capability: game-server CORS
      allowlist now accepts the marketing-site root + www hostnames;
      WP-149's public-leaderboard page can call `api.*` cross-origin.
- [ ] `docs/ai/DECISIONS.md` — no new D-NNNNN expected at execution
      (mirrors WP-146's no-new-decision posture; the marketing-site
      hostname admission is a mechanical extension of WP-146's
      same-pattern allowlist edit). If the executor needs to lock
      a follow-on decision (e.g., redirect policy), the WP §Open
      Questions block must be amended first.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-148 checked off
      with today's date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-151 row flipped
      `Draft` → `Done`.
- [ ] No files outside `## Files Expected to Change` were modified
      during execution (confirmed with `git diff --name-only` and
      `git status --porcelain`).
