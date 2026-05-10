# EC-146 — Arena-Client Brand-Tokens Integration (Execution Checklist)

**Source:** External — `legendary-arena/legendary-arena-website` repo,
`docs/ai/work-packets/WP-007a-play-deploy.md` (marketing-side WP).
There is no engine-repo Work Packet file; per the engine-repo
`.claude/rules/work-packets.md` rule, marketing-side WPs that exercise
the cross-site brand-tokens contract cite the originating WP in commit
messages rather than spawning an engine-repo WP file.

**Layer:** `apps/arena-client/**` only (Client / SPA application
layer). No engine, registry, preplan, or server runtime change. No
package boundary crossed. No new runtime npm dependencies.

## Provenance breadcrumb

The natural EC number for WP-007a's engine-side work would be
`EC-007a`. That collides with the existing `EC-007A-turn-phases-contracts`
checklist (Phase 2 — Core Turn Engine), and the EC_INDEX numbering
rule's case-insensitive file lookup means `EC-007a` and `EC-007A`
resolve to the same `find -iname` match. Per the locked retargeting
precedent at the top of `EC_INDEX.md` (EC-103 → EC-111; EC-101 → EC-114;
EC-109 → EC-115), this EC takes the next free Phase 7 slot above the
latest landed (EC-145), which is **EC-146**. The marketing-repo WP
number (`WP-007a`) is unchanged; only the engine-repo EC slot moves.

## Before Starting

- [ ] WP-006 lock commit on `origin/main` of the marketing-site repo
      (`legendary-arena/legendary-arena-website`); confirmed via roadmap
      `WP-006 ✅ Done (2026-05-09)`
- [ ] WP-006 CORS contract live: `curl -I -H "Origin:
      https://play.legendary-arena.com" https://www.legendary-arena.com/brand-tokens.css`
      returns `200` + `Access-Control-Allow-Origin: *` +
      `Cache-Control: public, must-revalidate, max-age=3600`; body shows
      `Version: v1` in the leading comment block
- [ ] `pnpm install --frozen-lockfile && pnpm --filter
      "@legendary-arena/arena-client..." build` succeeds from a clean
      engine-monorepo working tree (this is the verbatim CF Pages build
      command per WP-144 / D-14401 amendment)
- [ ] Pre-WP-007a DNS state for `play.legendary-arena.com` recorded
      (almost certainly no public records — the subdomain is `state:
      "planned"` per `docs/ops/domains.json`); captured for the lock-time
      Decisions log entry on the marketing repo

## Locked Values (do not re-derive)

- **Cross-origin URL:** `https://www.legendary-arena.com/brand-tokens.css`
- **Local fallback path:** `apps/arena-client/public/brand-tokens.local.css`
- **`<link>` order:** local fallback FIRST, cross-origin live URL
  SECOND. Reverse order silently breaks the fallback path. `@import` is
  forbidden. `crossorigin` attribute is intentionally OMITTED on the
  brand-token links (live URL responds with `Access-Control-Allow-Origin:
  *`; omitting widens reachability under middlebox CORS-strictness).
  No JavaScript-driven token loading.
- **SHA-256 hash parity at lock:** the live URL response body and the
  bundled fallback body (with the SNAPSHOT comment block stripped)
  hash byte-identical. Mismatch = stale snapshot; refresh required
  before lock.
- **Mount point:** top-level layout boundary. Header / footer NEVER
  injected per-view, NEVER conditionally rendered on gameplay state,
  NEVER inside a Pinia-store-driven `v-if` whose condition can ever
  evaluate `false` during normal operation.
- **Header nav links:**
  - "Home" → `https://www.legendary-arena.com`
  - "Cards" → `https://cards.barefootbetters.com` (registry URL per
    `01-VISION.md` v1 Decisions log; the migration to
    `cards.legendary-arena.com` is OUT of scope under WP-007a)
- **SPA fallback:** `apps/arena-client/public/_redirects` ships
  `/*  /index.html  200` (path-only source — supported by CF Pages).
- **No raw hex outside `brand-tokens.local.css`.** All body / heading /
  link colors and any class-color affordances route through `var(--la-*)`
  tokens. This is what WP-009 will audit; landing it correctly here
  makes WP-009 a verification, not a remediation.

## Guardrails

- **No engine code changes for branding-only reasons.** Layer-boundary
  rules in `.claude/rules/architecture.md` apply; arena-client may
  import `@legendary-arena/preplan` at runtime (per D-5901) and the UI
  framework. WP-007a adds NO new runtime imports — pure HTML / CSS /
  Vue surface.
- **No new runtime npm dependencies.** `pnpm-lock.yaml` modification by
  this WP is a failure condition.
- **Out-of-scope arena-client paths** (DO NOT modify): `src/main.ts`,
  `src/client/**`, `src/lobby/**`, `src/stores/**`,
  `src/components/{hud,play,log,preplan,replay}/**`, `src/composables/**`,
  `src/pages/**`, `src/prefs/**`, `src/preplan/**`, `src/replay/**`,
  `src/lib/**`, `src/fixtures/**`, `src/testing/**`, `package.json`,
  `tsconfig*.json`, `vite.config.ts`.
- **Out-of-scope cross-package paths:** `packages/game-engine/**`,
  `packages/registry/**`, `packages/preplan/**`,
  `packages/vue-sfc-loader/**`, `apps/server/**`,
  `apps/registry-viewer/**`, `apps/replay-producer/**`,
  `apps/wiki-viewer/**`, root `package.json`, `pnpm-lock.yaml`.
- **PUBLIC_BASE_URL env on `apps/server` is OUT OF SCOPE.** Once
  WP-007a locks, the Stripe Checkout success / cancel redirects should
  point at `https://play.legendary-arena.com`, but that's a server-side
  env-var change — separate task. Surface as a follow-up note at lock;
  do NOT modify `apps/server/`.
- **Determinism is failure-level (Step 6 in WP-007a body).** Two
  consecutive `pnpm --filter "@legendary-arena/arena-client..." build`
  runs MUST produce byte-identical `apps/arena-client/dist/` output;
  any variance is a blocker, not a warning.
- **Local fallback must FULLY preserve visual integrity** when the
  cross-origin URL is blocked. Step 11.4 network-block test enumerates
  binary PASS / FAIL criteria; no subjective interpretation permitted.

## Required `// why:` Comments

- `apps/arena-client/index.html` `<head>` block: anchor (a) the cascade
  contract (CSS spec, equal-specificity → source order; live wins on
  cascade tie; fallback applies under outage), (b) the SHA-256 byte-
  parity contract between the two stylesheets, (c) the deliberate
  omission of the `crossorigin` attribute (ACAO=`*` makes it optional;
  omission widens reachability under middlebox CORS-strictness)
- `apps/arena-client/public/brand-tokens.local.css` SNAPSHOT comment:
  anchor canonical source URL + refresh date + future-v2-bump
  obligation
- `apps/arena-client/src/styles/base.css`: anchor (a) why the existing
  `--color-*` tokens are kept as aliases routing through `--la-*` brand
  tokens rather than rewritten at every call site, (b) why no
  `prefers-color-scheme: dark` block is reintroduced (brand tokens v1
  are mode-stable on `:root` and switch only under
  `html[data-theme="dark"]`, which arena-client v1 does not toggle —
  duplicating values would violate the v1 contract; reintroducing raw
  hex would violate the no-raw-hex rule)
- `apps/arena-client/src/components/branding/AppShell.vue`: anchor the
  WP-007a Step 5 mounting requirement (top-level layout boundary;
  header / footer mount once and never depend on gameplay state)

## Files to Produce

**Created:**
- `apps/arena-client/public/brand-tokens.local.css` — bundled v1
  fallback snapshot with SNAPSHOT comment header
- `apps/arena-client/public/_redirects` — SPA routing fallback
- `apps/arena-client/src/components/branding/AppShell.vue` — top-level
  layout wrapper
- `apps/arena-client/src/components/branding/Header.vue` — brand header
- `apps/arena-client/src/components/branding/Footer.vue` — brand footer
- `docs/ai/execution-checklists/EC-146-arena-client-brand-integration.checklist.md`
  (this file)

**Modified:**
- `apps/arena-client/index.html` — two `<link>` tags + contractual
  comment block in `<head>`
- `apps/arena-client/src/App.vue` — wrap render output in `<AppShell>`;
  no routing-logic changes
- `apps/arena-client/src/styles/base.css` — route existing `--color-*`
  tokens through `--la-*` brand tokens; remove
  `prefers-color-scheme: dark` block (brand tokens v1 are mode-stable)
- `docs/ai/execution-checklists/EC_INDEX.md` — Phase 7 row added
- `docs/ops/domains.json` — at WP-007a lock: `play` row `state:
  "planned"` → `state: "live"` with `notes` mirroring WP-006 pattern;
  bump `updated`
- `docs/ops/DOMAINS.md` — at WP-007a lock: `play` section updated in
  lockstep

**Explicitly NOT touched** (verify via `git diff --stat`): every path
listed under "Out-of-scope arena-client paths" and "Out-of-scope
cross-package paths" above. `apps/arena-client/package.json`,
`pnpm-lock.yaml`, `tsconfig*.json`, `vite.config.ts` byte-identical to
HEAD.

## After Completing

- [ ] `pnpm install --frozen-lockfile && pnpm --filter
      "@legendary-arena/arena-client..." build` exits 0; Vite reports
      `vite v5.x` and `✓ N modules transformed`
- [ ] `apps/arena-client/dist/index.html` references the cross-origin
      `<link>` to www's brand-tokens
- [ ] `apps/arena-client/dist/brand-tokens.local.css` exists; first
      lines show SNAPSHOT comment + `Version: v1`
- [ ] `apps/arena-client/dist/_redirects` exists with
      `/*  /index.html  200`
- [ ] Determinism: two consecutive builds produce byte-identical
      `apps/arena-client/dist/` (`Compare-Object` over SHA-256 hashes
      returns empty)
- [ ] SHA-256 hash parity at lock: live URL response body and bundled
      fallback body (post-SNAPSHOT comment strip) hash byte-identical
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] `git diff --stat packages/ apps/server/ apps/registry-viewer/
      apps/replay-producer/ apps/wiki-viewer/ data/` empty
- [ ] CF Pages project `legendary-arena-play` (or chosen name) created
      with the verbatim WP-144-amended build command, output dir,
      production branch, and `NODE_VERSION = 22` env var
- [ ] First production deploy succeeds; `*.pages.dev` deploy is
      functionally equivalent to local `dist/` served via static HTTP
      (Step 9 build parity assertion)
- [ ] `https://play.legendary-arena.com/` loads over HTTPS; cert
      Active; no mixed-content warnings
- [ ] Cross-origin `brand-tokens.css` fetched on live URL with HTTP
      `200` + ACAO=`*` + `Version: v1` in body; same-origin
      `/brand-tokens.local.css` returns `200` + `Version: v1`
- [ ] Step 11.4 network-block test PASS (typography + spacing + colors
      + class-color affordances all correct under blocked cross-origin
      URL; no FOUC; no layout shift; no `--la-*` custom property
      resolves to declared default rather than v1 contract value)
- [ ] Lighthouse ≥ 90 on `https://play.legendary-arena.com/` in
      Performance, Accessibility, Best Practices, SEO
- [ ] Console clean on live URL (zero errors, zero failed network
      requests beyond the intentional Step 11.4 block)
- [ ] Game-flow smoke test: open client → reach play surface → exit
      cleanly with no console errors
- [ ] `docs/ops/domains.json` `play` row flipped `planned` → `live`
      with `notes` + bumped `updated`; `docs/ops/DOMAINS.md` updated in
      lockstep
- [ ] Marketing-repo lock entries landed: `03-ROADMAP.md` WP-007a row
      flipped ⏸️ → ✅ with commits + Lighthouse + project name;
      `01-VISION.md` Decisions log entry recording CF project name,
      pinned `NODE_VERSION`, pre-WP-007a DNS state, hash-parity contract
      codification, v1 cross-site carve-out half-closure status
      (full closure when WP-007b also locks)

## Common Failure Smells

- **Cross-origin fetch fails in dev or on live URL** → almost always a
  WP-006 CORS contract regression (zone-level Browser Cache TTL drifted
  off "Respect Existing Headers"). Re-run Step 2 from a foreign Origin
  header before assuming a WP-007a-side bug.
- **SHA-256 parity check fails at lock** → snapshot is stale relative
  to live URL. Re-copy from
  `C:\www\legendary-arena-com\static\brand-tokens.css`, re-add SNAPSHOT
  comment header, re-hash. If the mismatch is a real v1 → v2 bump on
  www, WP-007a is the wrong WP — stop and surface.
- **Determinism violation at Step 6** → identify timestamp injection /
  non-deterministic plugin output / locale-dependent sort / `Date.now()`
  in the build pipeline. Remove at the source. Do NOT mask by sorting
  or filtering the diff.
- **`*.pages.dev` deploy diverges functionally from local `dist/`** →
  framework auto-detection picked the wrong build path; re-confirm
  framework preset is "None" / "Custom" and the build command is the
  exact WP-144-amended verbatim string.
- **Network-block test produces ANY FAIL criterion** (FOUC, missing
  font, broken spacing, missing class-color affordance, any `--la-*`
  property resolving to declared default) → the cross-site contract is
  one outage away from breaking visually; this is the failure mode the
  bundled fallback exists to prevent. Hard requirement before lock; no
  subjective interpretation permitted.
- **Lighthouse < 90 in any category** → most likely TBT cost from
  boardgame.io initialization. Identify dominant cost and decide
  whether to defer-load. Do NOT lock with sub-90.
