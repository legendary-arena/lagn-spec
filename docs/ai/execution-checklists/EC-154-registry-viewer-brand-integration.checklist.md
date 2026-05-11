# EC-154 — Registry-Viewer Brand-Tokens Integration (Execution Checklist)

**Source:** External — `legendary-arena/legendary-arena-website` repo,
`docs/ai/work-packets/WP-007b-cards-brand-integration.md` (marketing-
side WP). Per `.claude/rules/work-packets.md`, marketing-side WPs that
exercise the cross-site brand-tokens contract cite the originating WP
in commit messages; this EC is the engine-side execution contract.

**Layer:** `apps/registry-viewer/**` only. No engine, registry,
preplan, or server runtime change. No package boundary crossed. No
new runtime npm dependencies.

## Provenance breadcrumb

Natural EC number for WP-007b's engine-side work would be `EC-007b`.
That collides with the existing `EC-007B-core-turn-loop-and-stage-advancement`
checklist (Phase 2 — Core Turn Engine), and the EC_INDEX numbering
rule's case-insensitive file lookup means `EC-007b` and `EC-007B`
resolve to the same `find -iname` match. Per the locked retargeting
precedent (EC-103 → EC-111; EC-101 → EC-114; EC-109 → EC-115;
EC-007a → EC-146), this EC takes the next free Phase 7 slot above
the latest landed (EC-153), which is **EC-154**. The marketing-repo
WP number (`WP-007b`) is unchanged; only the engine-repo EC slot moves.

## Before Starting

- [ ] WP-006 lock commit on `origin/main` of the marketing-site repo;
      `WP-006 ✅ Done (2026-05-09)` in roadmap
- [ ] WP-007a lock commit on `origin/main` of the marketing-site repo;
      `WP-007a ✅ Done (2026-05-10)` in roadmap (precedent for the
      cross-site brand-tokens consumer pattern)
- [ ] WP-006 CORS contract live from a `cards.barefootbetters.com`
      Origin: `200` + `Access-Control-Allow-Origin: *` +
      `Cache-Control: public, must-revalidate, max-age=3600`; body
      shows `Version: v1` in the leading comment block
- [ ] `pnpm install --frozen-lockfile && pnpm --filter
      "registry-viewer..." build` succeeds from a clean engine-monorepo
      working tree (topological form per the WP-144 / D-14401 pattern
      established for arena-client; the bare `--filter registry-viewer
      build` form fails on a fresh tree because
      `packages/registry/dist/` is gitignored — Amendment 4 in the WP
      body records the observation but does NOT change the locked CF
      Pages command text; CF dashboard visibility was lacking at
      execution time)
- [ ] Pre-WP baseline build captured at the merge-base of the feature
      branch against `main`: `dist/` total bytes (= 256,303 at
      `bd8cdb0`); per-file sizes of `dist/assets/*.js` (= 214,069 for
      `index-*.js`)

## Locked Values (do not re-derive)

- **Cross-origin URL:** `https://www.legendary-arena.com/brand-tokens.css`
- **Local fallback path:** `apps/registry-viewer/public/brand-tokens.local.css`
- **`<link>` order:** local fallback FIRST, cross-origin live URL
  SECOND. Reverse order silently breaks the fallback path. `@import`
  is forbidden. `crossorigin` attribute is intentionally OMITTED on
  the brand-token links (live URL responds with
  `Access-Control-Allow-Origin: *`). No JavaScript-driven token loading.
- **SHA-256 hash parity at lock:**
  `70C11CEB75A993F2806056DB8D955D5D3133362D97C03A51EFB6719C575713FF`
  (matches WP-007a's 2026-05-10 lock-time hash — same v1 contract for
  both `play.*` and `cards.*` consumers).
- **Mount point:** top-level layout boundary via new
  `src/components/branding/AppShell.vue`. Header / footer NEVER
  injected per-view, NEVER conditionally rendered on
  registry-load / R2-fetch / tab-switcher state, NEVER inside a
  `v-if` whose condition can ever evaluate `false` during normal
  operation (including the "registry still loading" state).
- **Header nav links:**
  - "Home" → `https://www.legendary-arena.com`
  - "Play" → `https://play.legendary-arena.com`
  - The registry's own URL is NOT a self-link in its own header.
- **No raw hex outside `brand-tokens.local.css`** — `.app`
  background/color route through `var(--la-color-bg-primary)` /
  `var(--la-color-text-primary)`; index.html body font-family through
  `var(--la-font-body)`; `HC_COLOR` constants in `src/lib/theme.ts`
  retoken to `var(--la-color-class-{hc})` for all five hero classes.
  `TYPE_COLOR` / `RARITY_DOT` / `TAG_COLOR` constants unchanged — no
  v1 token coverage; v1 → v2 bump questions, out of scope.
- **Mount-point coupling (in-scope, per WP body Amendment 3 extended):**
  the `.app { height: 100vh }` → `flex: 1; min-height: 0` change and
  the single `import AppShell from './components/branding/AppShell.vue'`
  line in `App.vue` are the wrapper seam the mount deliverable
  necessarily creates. Neither is forbidden by the §Forbidden CSS
  transformations / "no net-new imports" lists — those apply to
  per-component drift-prevention during the color audit, not to the
  mount surface itself.
- **§Step 7 byte-budget (post-Amendment-5 split):**
  implementation-byte delta ≤ +10 kB (uncompressed; total `dist/`
  bytes minus `brand-tokens.local.css` snapshot bytes). This WP's
  delta = +8,078 bytes — PASS. Snapshot bytes (= 10,799) reported
  separately; gated only by the SHA-256 hash-parity check.
- **Mechanical 4-point enforcement check** (passes at lock):
  (1) no net-new data-pipeline imports outside `branding/` —
  the one mount-coupling import in `App.vue` is in-scope per
  Amendment 3 extended; it imports `AppShell`, not registry /
  composables / Client;
  (2) zero diffs under `src/registry/` / `src/composables/` /
  `src/lib/*Client.ts`;
  (3) `dist/` file-count delta ≤ +3 (this WP: +1);
  (4) implementation-byte delta ≤ +10 kB (this WP: +8,078).

## Guardrails

- **No engine code changes for branding-only reasons.** Layer-boundary
  rules in `.claude/rules/architecture.md` apply; registry-viewer may
  import `@legendary-arena/registry` at runtime and the UI framework.
  WP-007b adds NO new runtime data-pipeline imports — pure HTML / CSS
  / Vue surface.
- **No new runtime npm dependencies.** `pnpm-lock.yaml` modification
  by this WP is a failure condition.
- **Out-of-scope registry-viewer paths** (DO NOT modify):
  `src/main.ts`, `src/lib/*Client.ts`, `src/composables/**`,
  `src/registry/**`, `public/registry-config.json`, any `.test.ts`
  outside breakage caused by this WP, `package.json`, `tsconfig*.json`,
  `vite.config.ts`.
- **Out-of-scope cross-package paths:** `packages/game-engine/**`,
  `packages/registry/**`, `packages/preplan/**`,
  `packages/vue-sfc-loader/**`, `apps/server/**`, `apps/arena-client/**`,
  `apps/replay-producer/**`, `apps/wiki-viewer/**`, root
  `package.json`, `pnpm-lock.yaml`.
- **Out-of-scope ops paths:** `docs/ops/domains.json`,
  `docs/ops/DOMAINS.md` — per Hostname posture in WP body, the
  `cards.legendary-arena.com` row describes a deferred future
  migration; `cards.barefootbetters.com` lives outside the
  `legendary-arena.com` zone by design and is intentionally absent.
- **Header / Footer import contract** (enforceable via grep):
  branding components MUST NOT import from `src/registry/**`,
  `src/composables/**`, or `src/lib/*Client.ts`. Verified:
  `Select-String -Path apps/registry-viewer/src/components/branding/*.vue
  -Pattern '^\s*import .*from .*(registry|composables|Client)'`
  returns zero matches.
- **No silent fixes.** Manual edits to `apps/registry-viewer/dist/**`,
  DevTools "Local Overrides," CF dashboard file edits, or
  hostname-conditional shims are NOT valid fixes. Every fix survives
  a clean rebuild from `pnpm install --frozen-lockfile && pnpm
  --filter "registry-viewer..." build`.

## Required `// why:` Comments

- `apps/registry-viewer/index.html` `<head>` block: anchor (a) the
  cascade contract (CSS spec, equal-specificity → source order; live
  wins on cascade tie; fallback applies under outage), (b) the SHA-256
  byte-parity contract between the two stylesheets, (c) the deliberate
  omission of the `crossorigin` attribute (ACAO=`*` makes it optional)
- `apps/registry-viewer/public/brand-tokens.local.css` SNAPSHOT
  comment: anchor canonical source URL + refresh date + future-v2-bump
  obligation
- `apps/registry-viewer/src/App.vue` scoped style on `.app`: anchor
  the WP-007b mount-layout consequence — why `height: 100vh` swapped
  to `flex: 1; min-height: 0` (the shell's BrandHeader / BrandFooter
  consume the viewport edges while `.app` fills the remainder)
- `apps/registry-viewer/src/lib/theme.ts` `HC_COLOR` block: anchor
  why the values are now `var(--la-color-class-*)` references rather
  than bare hex (palette.md §4.4 application patterns; inheritance
  of any v1 → v2 brand-tokens evolution via the cross-origin link)

## Files to Produce

**Created:**
- `apps/registry-viewer/public/brand-tokens.local.css` — bundled v1
  fallback snapshot with SNAPSHOT comment header
- `apps/registry-viewer/src/components/branding/Header.vue` — brand header
- `apps/registry-viewer/src/components/branding/Footer.vue` — brand footer
- `apps/registry-viewer/src/components/branding/AppShell.vue` — top-level
  layout wrapper
- `docs/ai/execution-checklists/EC-154-registry-viewer-brand-integration.checklist.md`
  (this file)

**Modified:**
- `apps/registry-viewer/index.html` — two `<link>` tags + contractual
  comment block in `<head>`; inline reset routed through brand tokens
- `apps/registry-viewer/src/App.vue` — wrap render output in
  `<AppShell>`; `.app { height: 100vh }` → `flex: 1; min-height: 0`;
  `.app` background / color tokenized; single mount-coupling import
  of `AppShell`
- `apps/registry-viewer/src/lib/theme.ts` — `HC_COLOR` retokened to
  `var(--la-color-class-*)` for all five hero classes
- `docs/ai/execution-checklists/EC_INDEX.md` — Phase 7 row added

**Explicitly NOT touched** (verify via `git diff --stat`): every path
listed under "Out-of-scope registry-viewer paths" and "Out-of-scope
cross-package paths" above. `apps/registry-viewer/package.json`,
`pnpm-lock.yaml`, `tsconfig*.json`, `vite.config.ts` byte-identical
to HEAD.

## After Completing

- [ ] `pnpm install --frozen-lockfile && pnpm --filter
      "registry-viewer..." build` exits 0
- [ ] `apps/registry-viewer/dist/index.html` contains both `<link>`
      tags in contractual order
- [ ] `apps/registry-viewer/dist/brand-tokens.local.css` exists; first
      lines show SNAPSHOT comment + `Version: v1`
- [ ] `pnpm --filter registry-viewer test` exits 0 (31/31 passing)
- [ ] `pnpm --filter registry-viewer typecheck` exits 0
- [ ] `pnpm --filter registry-viewer lint` exits 0 (0 errors;
      pre-existing warnings acceptable)
- [ ] SHA-256 hash parity at lock: live URL response body and bundled
      fallback body (post-SNAPSHOT comment strip) hash byte-identical
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] `git diff --stat packages/ apps/server/ apps/arena-client/
      apps/replay-producer/ apps/wiki-viewer/ data/` empty
- [ ] CF Pages project `legendary-arena` (cards) preview deploy
      succeeds on the `wp-007b-cards-brand` branch
- [ ] `https://cards.barefootbetters.com/` loads over HTTPS after
      merge to `main`; no mixed-content warnings
- [ ] Cross-origin `brand-tokens.css` fetched on live URL with HTTP
      `200` + ACAO=`*` + `Version: v1` in body; same-origin
      `/brand-tokens.local.css` returns `200` + SNAPSHOT comment
- [ ] Lighthouse ≥ 90 on `https://cards.barefootbetters.com/` in
      Performance, Accessibility, Best Practices, SEO
- [ ] Console clean on live URL (zero errors; info/log lines from
      existing devLog acceptable)
- [ ] Card-browse smoke test: search a known card name, open detail,
      verify ability tokens render, close
- [ ] Theme-browse smoke test: open a theme, click a cross-linked
      card, verify Cards view filter applies
- [ ] Loadout smoke test: switch to Loadout tab, verify builder
      renders without error
- [ ] Header / footer brand parity vs `https://www.legendary-arena.com/`
      (eye check)
- [ ] Marketing-repo lock entries landed: `03-ROADMAP.md` WP-007b
      row flipped ⏸️ → ✅ with commits + Lighthouse + CF project
      name; `01-VISION.md` Decisions log entry recording v1
      cross-site carve-out FULL CLOSURE (both `play.*` and `cards.*`
      consumers now verified)

## Common Failure Smells

- **Cross-origin fetch fails in dev or on live URL** → almost always
  a WP-006 CORS contract regression (zone-level Browser Cache TTL
  drifted off "Respect Existing Headers"). Re-run the
  cards.barefootbetters.com-Origin probe before assuming a WP-007b
  bug.
- **SHA-256 parity check fails at lock** → snapshot is stale relative
  to live URL. Re-copy from
  `C:\www\legendary-arena-com\static\brand-tokens.css`, re-add SNAPSHOT
  comment header, re-hash. If the mismatch is a real v1 → v2 bump on
  www, WP-007b is the wrong WP — stop and surface.
- **Local single-filter build fails with `Failed to resolve import
  @legendary-arena/registry/schema`** → workspace-dep build cache
  miss; same shape as WP-007a's 2026-05-09 pause. Use `pnpm --filter
  "registry-viewer..." build` (topological form). Amendment 4 in the
  WP body records this observation.
- **`dist/` byte delta busts +10 kB** under the legacy total-bytes
  rule but the snapshot is the dominant cost → confirm against the
  post-Amendment-5 implementation-byte split (total `dist/` bytes
  minus `brand-tokens.local.css` bytes); the +10 kB budget applies to
  implementation only.
- **Mechanical check 1 ("no net-new imports outside `branding/`")
  flags the App.vue → AppShell import** → that's the in-scope
  mount-coupling import per Amendment 3 extended. Re-read the rule:
  check 1's load-bearing intent is "no new data-pipeline imports
  outside `branding/`" (no `registry` / `composables` / `*Client`),
  not "no new branding imports."
