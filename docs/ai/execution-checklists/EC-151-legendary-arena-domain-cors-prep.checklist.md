# EC-151 — `legendary-arena.com` + `www` CORS Prep (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-148-legendary-arena-domain-cors-prep.md`
**Layer:** `apps/server/**` only. No engine, registry, preplan, or UI
change. Single-file edit + two-line allowlist amendment + comment-block
expansion. Direct sibling of EC-149 (the `cards.legendary-arena.com`
equivalent).

## Before Starting

- [ ] WP-146 / EC-149 merged on `main` (`5999d10` or successor); the
      five-entry `Server({ origins: [...] })` literal is in place
- [ ] `apps/server/src/server.mjs` `origins` array contains exactly:
      `https://play.legendary-arena.com`,
      `https://legendary-arena-play.pages.dev`,
      `https://cards.barefootbetters.com`,
      `https://cards.legendary-arena.com`,
      `http://localhost:5173`
- [ ] `pnpm install --frozen-lockfile && pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` passes WP-146 /
      EC-149 baseline (`250 / 184 / 66 / 0`)
- [ ] WP-148 + WP-149 + WP-150 SPEC drafting commit merged to `main`
      (so the six paired WP / EC files are on disk before EC-151
      execution begins)

## Locked Values (do not re-derive)

- **Origins added** to `apps/server/src/server.mjs`:
  - `https://legendary-arena.com` — marketing-site Hugo bundle root
  - `https://www.legendary-arena.com` — `www`-canonical alternate
- **Origins preserved byte-identical** (no removal, no rename, no
  reorder): the five entries from EC-149's locked set.
- **Final array length:** 7 entries.
- **Array entry order:** existing five entries retain their relative
  order; the two new entries are inserted adjacent to
  `https://play.legendary-arena.com` so the `legendary-arena.com`
  family sits together visually. Reorder of the five pre-existing
  entries is a scope violation even if the resulting set is identical.
- **No env-var-driven origin lists.** Array remains literal per
  code-style Rule 7 (EC-147 / EC-149 §Locked Values).
- **No `domains.json` change.** Any planned → live flip is a separate
  SPEC commit at cutover lock time (WP-007a `2276224` precedent).

## Guardrails

- **No game logic.** Server is a wiring layer per `.claude/rules/server.md`.
- **No persistence touch.** No `G` / `ctx` / database change.
- **No engine / registry / preplan package change.** Those package
  trees byte-identical to HEAD.
- **No UI change.** `apps/arena-client/**`, `apps/registry-viewer/**`,
  `apps/replay-producer/**`, `apps/wiki-viewer/**` byte-identical.
- **No new runtime npm deps.** `pnpm-lock.yaml` byte-identical to HEAD.
- **No `render.yaml` change.** Render auto-redeploys from `main`.
- **No unit test coverage of CORS allowlist matching.** The
  boardgame.io `Server` cors-package match is upstream-tested;
  WP-148 §Step 7 post-deploy curl is the canonical verification
  surface (EC-149 precedent, locked under D-14601).

## Required `// why:` Comments

- `apps/server/src/server.mjs` `Server({ origins: [...] })` block:
  expand the existing `// why:` block to add two bullets — one for
  the marketing-site root, one for the `www`-canonical alternate.
  Match the existing bullet style (`//   - <bare-URL> — <purpose>.`)
  — bare-URL form is permitted in comments and matches EC-147 /
  EC-149 precedent.
- **Single-quoted-literal discipline (always-on):** never use
  single-quoted form (`'https://...'`) inside any `// why:` block —
  that format is reserved for array entries and would inflate WP-148
  §Step 3's block-scoped origin count of 7. Prefer role-based
  phrasing ("marketing-site Hugo bundle hostname",
  "`www`-canonical alternate", "needed for the WP-149 public-
  leaderboard page to call `api.legendary-arena.com` cross-origin").

## Files to Produce

**Modified:**
- `apps/server/src/server.mjs` — two new entries in the
  `Server({ origins: [...] })` literal array; expanded `// why:` block
- `docs/ai/work-packets/WORK_INDEX.md` — WP-148 row flipped to done
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-151 row flipped
  `Draft` → `Done`

**Explicitly NOT touched:** every path under `packages/`,
`apps/arena-client/`, `apps/registry-viewer/`, `apps/replay-producer/`,
`apps/wiki-viewer/`, `data/`, `scripts/`, root `package.json`,
`pnpm-lock.yaml`, root `tsconfig.json`, `render.yaml`,
`docs/ops/domains.json`, `docs/ops/DOMAINS.md`. Verify via
`git diff --stat <those paths>` empty.

## After Completing

- [ ] `apps/server/src/server.mjs` has 7 entries in the `origins`
      array (5 prior + 2 new); pre-existing five retain relative order
- [ ] Block-scoped origin count returns 7 (WP-148 §Step 3 regex)
- [ ] `pnpm --filter @legendary-arena/server test` passes baseline
      `250 / 184 / 66 / 0`
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] WP-148 §Step 5 `Compare-Object` returns no output
- [ ] After commit + push to `main`, Render auto-redeploys;
      `curl -I -H "Origin: https://legendary-arena.com"
      https://api.legendary-arena.com/api/leaderboards/scenarios`
      returns 200 with `Access-Control-Allow-Origin` set; same
      from `https://www.legendary-arena.com` Origin
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-148 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-151 `Draft` → `Done`

## Common Failure Smells

- **CORS still fails on the new hostnames after deploy** — Render's
  GitHub auto-deploy can lag minutes; verify the most recent Render
  deploy reflects this EC's commit hash.
- **Allowlist mismatch on trailing slash or scheme** — exact-string
  match. Keep both new entries with no trailing slash, matching the
  five existing entries.
- **`www` vs apex confusion** — both `https://legendary-arena.com`
  and `https://www.legendary-arena.com` must be allowlisted; some
  browsers send the apex Origin even when the user typed `www`, and
  vice versa.
