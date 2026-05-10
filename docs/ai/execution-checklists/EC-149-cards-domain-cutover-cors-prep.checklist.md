# EC-149 — `cards.legendary-arena.com` Cutover Prep — Server CORS (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-146-cards-domain-cutover-cors-prep.md`
**Layer:** `apps/server/**` only. No engine, registry, preplan, or UI
change. Single-file edit + one-line allowlist amendment + comment-block
expansion. Direct sibling of EC-147 (the play.* equivalent).

## Before Starting

- [ ] EC-147 merged on `main` (`8ff139a` or successor); the four-entry
      `Server({ origins: [...] })` literal is in place
- [ ] `apps/server/src/server.mjs` `origins` array contains exactly:
      `https://play.legendary-arena.com`,
      `https://legendary-arena-play.pages.dev`,
      `https://cards.barefootbetters.com`,
      `http://localhost:5173`
- [ ] `pnpm install --frozen-lockfile && pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` passes EC-147
      baseline (`250 / 184 / 66 / 0`)
- [ ] `docs/ops/domains.json` `cards` row is `state: "planned"` (do
      not flip in this EC; lock-time SPEC commit owns the flip)

## Locked Values (do not re-derive)

- **Origin added** to `apps/server/src/server.mjs`:
  - `https://cards.legendary-arena.com` — registry-viewer SPA at the
    new hostname; needed once the Cloudflare Pages dashboard cutover
    detaches `cards.barefootbetters.com` from the existing
    `legendary-arena` Pages project and attaches the new custom domain
- **Origins preserved byte-identical:**
  - `https://play.legendary-arena.com` (EC-147 contract)
  - `https://legendary-arena-play.pages.dev` (EC-147 contract)
  - `https://cards.barefootbetters.com` — retained during the
    dual-running window; removal owned by a separate post-cutover
    cleanup SPEC commit
  - `http://localhost:5173` (Vite dev-server default)
- **Final array length:** 5 entries
- **Array entry order:** existing four entries retain their current
  relative order; the new entry is inserted adjacent to
  `https://cards.barefootbetters.com` only. No other entries
  reordered. Reorder of the four pre-existing entries is a scope
  violation even if the resulting set is identical.
- **No env-var-driven origin lists.** Array remains literal per
  code-style Rule 7 (EC-147 §Locked Values).
- **No `domains.json` change.** The `cards` planned → live flip is a
  separate SPEC commit at cutover lock time (WP-007a `2276224`
  precedent).

## Guardrails

- **No game logic.** Server is a wiring layer per `.claude/rules/server.md`.
- **No persistence touch.** No `G` / `ctx` / database change.
- **No engine package change.** `packages/game-engine/`,
  `packages/registry/`, `packages/preplan/` byte-identical to HEAD.
- **No UI change.** `apps/arena-client/**`, `apps/registry-viewer/**`,
  `apps/replay-producer/**`, `apps/wiki-viewer/**` byte-identical to HEAD.
- **No new runtime npm deps.** `pnpm-lock.yaml` byte-identical to HEAD.
- **No render.yaml change.** Render auto-redeploys from `main`.
- **No removal of legacy `cards.barefootbetters.com` entry** in this
  EC. Dual-running is mandatory until the operator confirms the
  Cloudflare Pages cutover completed cleanly.
- **No unit-test coverage of CORS allowlist matching is added.** The
  boardgame.io `Server` cors-package match is upstream-tested; the
  library contract is the test surface. Step 7 post-deploy curl is
  the canonical verification surface for this EC (EC-147 precedent).
  Adding ad-hoc unit tests around the literal array would test the
  framework, not this packet's change, and is explicitly out of scope.

## Required `// why:` Comments

- `apps/server/src/server.mjs` `Server({ origins: [...] })` block:
  expand the existing `// why:` block to add one bullet for the new
  registry-viewer hostname and one bullet recording dual-running
  rationale for the legacy hostname during the Cloudflare Pages
  dashboard cutover. Match the existing block's bullet style
  (`//   - <bare-URL> — <purpose>.`) — bare-URL form is permitted
  in comments and matches EC-147 precedent.
- **Single-quoted-literal discipline (always-on, not conditional):**
  never use single-quoted form (`'https://...'`) inside any `// why:`
  block — that format is reserved for array entries and would inflate
  Step 3's block-scoped origin count of 5. Where prose alone suffices,
  prefer role-based phrasing ("the registry-viewer SPA hostname",
  "the legacy registry-viewer hostname during dual-running") to keep
  grep gates decoupled from comment text.

## Files to Produce

**Modified:**
- `apps/server/src/server.mjs` — one new entry in the
  `Server({ origins: [...] })` literal array; expanded `// why:`
  comment block
- `docs/ai/work-packets/WORK_INDEX.md` — WP-146 row added
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-149 row added

**Created:**
- `docs/ai/work-packets/WP-146-cards-domain-cutover-cors-prep.md`
- `docs/ai/execution-checklists/EC-149-cards-domain-cutover-cors-prep.checklist.md`
  (this file)

**Explicitly NOT touched:** every path under `packages/`,
`apps/arena-client/`, `apps/registry-viewer/`, `apps/replay-producer/`,
`apps/wiki-viewer/`, `data/`, `scripts/`, root `package.json`,
`pnpm-lock.yaml`, root `tsconfig.json`, `render.yaml`,
`docs/ops/domains.json`, `docs/ops/DOMAINS.md`. Verify via `git diff
--stat <those paths>` shows empty.

## After Completing

- [ ] `apps/server/src/server.mjs` has 5 entries in the `origins`
      array (4 prior + 1 new); pre-existing four retain relative order
- [ ] Block-scoped origin count returns 5 (`origins: [...]` block
      regex, not file-wide line match — see WP-146 §Verification Step 3)
- [ ] `pnpm --filter @legendary-arena/server test` passes baseline
      `250 / 184 / 66 / 0`
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] WP-146 §Verification Step 5 `Compare-Object` returns no output
      (modified-tracked + new-untracked file set matches `## Files to
      Produce` exactly)
- [ ] After commit + push to `main`, Render auto-redeploys
      `legendary-arena-server`; `curl -I -H "Origin:
      https://cards.legendary-arena.com"
      https://api.legendary-arena.com/games/legendary-arena` returns
      200 with `Access-Control-Allow-Origin` set
- [ ] **Cutover sequencing gate (operator):** the Cloudflare Pages
      dashboard custom-domain swap is performed only AFTER the bullets
      above are confirmed green and the latest successful Render deploy
      reflects this EC's commit hash. During the swap, both `cards.*`
      hostnames stay reachable in the dual-running window — no 4xx
      observed on either origin against `api.legendary-arena.com`.
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-14601 — dual-running rationale)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-146 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-149 `Draft` → `Done`

## Common Failure Smells

- **CORS still fails on the new hostname after deploy** — Render's
  GitHub auto-deploy can lag several minutes; verify the most recent
  successful Render deploy reflects this EC's commit hash.
- **Allowlist mismatch on trailing slash or scheme** — the
  cors-package allowlist is exact-string. `https://cards.legendary-arena.com/`
  (trailing slash) does not match a request from
  `https://cards.legendary-arena.com` (no slash). Keep the allowlist
  entry with no trailing slash, matching the four existing entries.
- **Operator detached the legacy hostname before this EC deployed** —
  if `cards.barefootbetters.com` traffic 4xx's during the gap window,
  the dual-running guarantee is broken. The fix is to land this EC
  first, confirm Render redeployed, then proceed with the dashboard
  swap. The operator runbook in `docs/ops/DOMAINS.md` §Cutover §3
  documents the order.
- **`domains.json` cards row flipped to `live` in this commit** —
  scope creep. Revert that file; the flip is a separate SPEC commit
  at lock time.
