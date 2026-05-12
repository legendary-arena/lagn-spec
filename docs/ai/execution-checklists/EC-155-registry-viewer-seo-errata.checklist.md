# EC-155 — Registry-Viewer SEO Errata: meta-description + robots.txt (Execution Checklist)

**Source:** External — `legendary-arena/legendary-arena-website` repo,
`docs/ai/work-packets/WP-007b-cards-brand-integration.md` (marketing-
side WP). This is a follow-on errata EC to **EC-154**, surfaced during
WP-007b Phase 5 Lighthouse verification.

**Layer:** `apps/registry-viewer/**` only — one new public file + one
`<head>` line. No engine, registry, preplan, or server change.

## Provenance

WP-007b Phase 5 ran `npx lighthouse@12
https://cards.barefootbetters.com/` against the post-merge production
URL (engine `f62ddef`). Results:

```
Performance:    61  ❌ (LCP 4.6 s; TBT 920 ms — R2 data-pipeline cost)
Accessibility:  95  ✓
Best Practices: 79  ❌ (font-size, deprecated APIs — pre-existing)
SEO:            83  ❌ (meta-description + robots-txt — pre-existing)
```

Performance + Best Practices failures are pre-existing
registry-viewer characteristics (R2 fetch cost, UI font sizes,
existing library deprecations) — they are CARVED OUT of WP-007b
scope per Amendment 7 in the WP body. This EC closes only the two
SEO audits — the same root cause + fix pattern that **EC-148**
applied to arena-client during WP-007a's Phase 5 errata (2026-05-10).

Two SEO audits failed:

1. **`meta-description: 0`** —
   `apps/registry-viewer/index.html` has no `<meta name="description">`
   tag. WP-007b §Step 3 prescribed the `<head>` shape verbatim with
   only meta charset + viewport + title + the brand-tokens consumption
   block; meta description was not enumerated.
2. **`robots-txt: 0`** — `https://cards.barefootbetters.com/robots.txt`
   returns HTTP 200 with the SPA shell HTML body, because CF Pages's
   default SPA fallback catches all non-asset paths and serves
   `index.html`. Lighthouse parses that HTML as a robots.txt and finds
   it structurally invalid. The registry-viewer's `public/` directory
   has no `robots.txt`.

This EC closes both gaps with the smallest scope that fixes SEO. The
SEO score is expected to rise from 83 to ~100 (matching arena-client's
post-EC-148 outcome).

## Before Starting

- [ ] EC-154 merged on `main` (engine-repo commit `f62ddef`)
- [ ] CF Pages project `legendary-arena` (cards) is live and reachable
      at `https://cards.barefootbetters.com/`
- [ ] WP-006 CORS contract live (re-verified at WP-007b Phase 5)

## Locked Values (do not re-derive)

- **`apps/registry-viewer/public/robots.txt` content (verbatim):**
  ```
  User-agent: *
  Disallow:
  ```
  Two lines, trailing newline. Allow-all posture mirrors www's
  robots.txt content semantics and EC-148's arena-client robots.txt;
  does NOT include a `Sitemap:` directive because the registry-viewer
  is a JS SPA with no sitemap.xml. WP-008 (the dedicated SEO baseline
  WP on the marketing site) owns any future cross-site sitemap
  refinement.

- **`<meta name="description">` in
  `apps/registry-viewer/index.html`:**
  ```html
  <meta name="description" content="Legendary Arena Registry Viewer — browse and inspect the Legendary deck-building card data. The arena awaits." />
  ```
  Copy describes the registry-viewer's actual purpose (card-data
  browser) and closes with the brand tagline ("The arena awaits.")
  per `01-VISION.md` Decisions log 2026-05-08 / WP-004. Position:
  in `<head>`, after `<meta name="viewport">` and before `<title>`
  — placement is conventional and does not conflict with the WP-007b
  Step 3-locked brand-tokens consumption block.

- **`<head>` shape after this EC:**
  ```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="..." />
    <title>Legendary Arena — Registry Viewer</title>
    <!-- WP-007b brand-token consumption ... -->
    <link rel="stylesheet" href="/brand-tokens.local.css" />
    <link rel="stylesheet" href="https://www.legendary-arena.com/brand-tokens.css" />
    <style>
      /* minimal reset routed through tokens */
    </style>
  </head>
  ```

## Guardrails

- **No copy expansion beyond meta-description.** OG / Twitter /
  Schema.org JSON-LD / canonical / favicons are all Lighthouse-SEO-
  improving but are NOT required for the ≥ 90 floor and are scope
  of WP-008 or a future registry-viewer-specific SEO WP. EC-155's
  job is closing the two specific failed audits.
- **No Performance / Best Practices fixes.** Per Amendment 7 in the
  WP-007b body, Perf 61 (R2 fetch / hydration cost) and BP 79
  (font-size / deprecations) are CARVED OUT — pre-existing
  characteristics, deferred to a future optimization WP. EC-155 does
  not touch them.
- **No brand-tokens edits.** The WP-007b cross-origin link + bundled
  local fallback are byte-stable; EC-155 changes only the `<head>`
  shape (one new meta line) and adds `public/robots.txt`. Hash parity
  on `brand-tokens.local.css` is unchanged.
- **No engine code change.** `packages/`, `apps/server/`,
  `apps/arena-client/`, etc. byte-identical to HEAD.
- **No new runtime npm dependencies.** `pnpm-lock.yaml`
  byte-identical to HEAD.

## Required `// why:` Comments

None. The two artifacts are static text; rationale lives in this EC
+ the marketing-repo WP-007b Amendment 7. Adding a `// why:` to
either would be noise.

## Files to Produce

**Created:**
- `apps/registry-viewer/public/robots.txt` — two-line allow-all
- `docs/ai/execution-checklists/EC-155-registry-viewer-seo-errata.checklist.md`
  (this file)

**Modified:**
- `apps/registry-viewer/index.html` — one `<meta name="description">`
  line added inside `<head>`, between viewport and title
- `docs/ai/execution-checklists/EC_INDEX.md` — Phase 7 row added for
  EC-155

**Explicitly NOT touched** (verify via `git diff --stat`): all paths
under `packages/`, `apps/server/`, `apps/arena-client/`,
`apps/registry-viewer/src/`,
`apps/registry-viewer/public/brand-tokens.local.css`,
`apps/registry-viewer/public/registry-config.json`,
`apps/registry-viewer/package.json`,
`apps/registry-viewer/vite.config.ts`,
`apps/registry-viewer/tsconfig*.json`, `apps/replay-producer/`,
`apps/wiki-viewer/`, `data/`, `scripts/`, root `package.json`,
`pnpm-lock.yaml`, root `tsconfig.json`, `render.yaml`.

## After Completing

- [ ] `apps/registry-viewer/public/robots.txt` exists with exact
      two-line content + trailing newline
- [ ] `apps/registry-viewer/index.html` `<head>` contains
      `<meta name="description" ...>` line per Locked Values
- [ ] `pnpm --filter "registry-viewer..." build` succeeds;
      `dist/robots.txt` exists with same content as source;
      `dist/index.html` contains the meta description
- [ ] `pnpm --filter registry-viewer test` exits 0 (31/31)
- [ ] `pnpm --filter registry-viewer typecheck` exits 0
- [ ] `pnpm --filter registry-viewer lint` exits 0
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] Hash parity on `brand-tokens.local.css` unchanged
      (`70C11CEB75A993F2806056DB8D955D5D3133362D97C03A51EFB6719C575713FF`)
- [ ] `git diff --stat packages/ apps/server/ apps/arena-client/
      apps/registry-viewer/src/ apps/replay-producer/ apps/wiki-viewer/
      data/ scripts/` empty
- [ ] After commit + push + merge to `main`, CF Pages auto-redeploys
      `legendary-arena`
- [ ] After redeploy, `curl -I https://cards.barefootbetters.com/robots.txt`
      returns `200` with `Content-Type: text/plain` (NOT `text/html`)
      and the verbatim two-line body
- [ ] After redeploy,
      `https://cards.barefootbetters.com/`'s rendered HTML contains
      the `<meta name="description">` line
- [ ] Lighthouse re-run on the live URL: SEO ≥ 90 (the 83 baseline
      rises to ~100 if both audits flip from 0 to 1, matching EC-148's
      outcome on arena-client)

## Common Failure Smells

- **CF Pages catches /robots.txt with the SPA fallback again** —
  shouldn't happen; Vite copies `public/robots.txt` verbatim into
  `dist/robots.txt`, and CF Pages serves real files before falling
  back to the SPA shell. Verify by checking `dist/robots.txt` post-
  build + CF Pages deploy logs.
- **Meta description appears in index.html source but Lighthouse
  still reports 0** — verify `content` is non-empty and matches the
  Locked Value verbatim; Vite does not strip meta tags.
- **Lighthouse re-run shows SEO=92 instead of 100** — possible if
  one audit scores partial credit. The ≥ 90 floor is the contract;
  92 is a pass.
- **`brand-tokens.local.css` hash drift** — EC-155 must not touch
  the snapshot. If hash parity breaks after EC-155, investigate Vite
  line-ending conversion, not the source file.
