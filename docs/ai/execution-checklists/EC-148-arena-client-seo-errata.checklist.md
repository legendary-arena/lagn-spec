# EC-148 — Arena-Client SEO Errata: meta-description + robots.txt (Execution Checklist)

**Source:** External — `legendary-arena/legendary-arena-website` repo,
`docs/ai/work-packets/WP-007a-play-deploy.md` (marketing-side WP).
This is a follow-on errata EC to **EC-146** + **EC-147**, surfaced
during WP-007a Step 11.5 Lighthouse verification.

**Layer:** `apps/arena-client/**` only — one new public file + one
`<head>` line. No engine, registry, preplan, or server change.

## Provenance

WP-007a Step 11.5 ran `npx lighthouse@12 https://play.legendary-arena.com/`
against the live URL after EC-146 (brand-tokens integration), Step 7
(CF Pages project), the operator's Step 7 amendment
(`VITE_SERVER_URL = https://api.legendary-arena.com` env), EC-147
(server CORS allowlist for play.* origins), and Step 10 (custom
domain bind) all landed. Results:

```
Performance:    96  ✓
Accessibility:  100 ✓
Best Practices: 100 ✓
SEO:            82  ❌ (below the WP-007a DoD ≥ 90 floor)
```

Two SEO audits failed:

1. **`meta-description: 0`** — `apps/arena-client/index.html` has no
   `<meta name="description">` tag. WP-007a Step 3 prescribed the
   `<head>` shape verbatim with only meta charset + viewport + title
   + the brand-tokens consumption block; meta description was not
   enumerated.
2. **`robots-txt: 0`** (Lighthouse reported "37 errors found") —
   `https://play.legendary-arena.com/robots.txt` returns HTTP 200
   with the SPA shell HTML body, because CF Pages's default SPA
   fallback catches all non-asset paths and serves `index.html`.
   Lighthouse parses that HTML body as a robots.txt file and finds
   it structurally invalid (because it's not a robots.txt at all).
   The arena-client's `public/` directory has no `robots.txt`; the
   marketing site at `www.legendary-arena.com/robots.txt` is a clean
   77-byte file (`User-agent: *\nDisallow:\nSitemap: ...`).

This EC closes both gaps with the smallest scope that satisfies the
WP-007a DoD bullet "Lighthouse ≥ 90 in all four categories."

## Before Starting

- [ ] EC-146 + EC-147 merged on `main`
- [ ] CF Pages project `legendary-arena-play` is live and reachable at
      `https://play.legendary-arena.com/`
- [ ] Operator confirmed CF Pages env var `VITE_SERVER_URL =
      https://api.legendary-arena.com` is set (Production scope) and
      the most recent CF deploy reflects it (the SPA bundle contains
      `api.legendary-arena.com` and not `localhost:8000`)
- [ ] Render `legendary-arena-server` deploy reflects EC-147; CORS
      probe from `https://play.legendary-arena.com` Origin returns
      ACAO populated

## Locked Values (do not re-derive)

- **`apps/arena-client/public/robots.txt` content (verbatim):**
  ```
  User-agent: *
  Disallow:
  ```
  Two lines, trailing newline. Allow-all posture mirrors www's
  robots.txt content semantics (`User-agent: *\nDisallow:`); does
  NOT include a `Sitemap:` directive because the arena-client is a
  JS SPA with no sitemap.xml. WP-008 (the dedicated SEO baseline WP
  on the marketing site) owns any future cross-site sitemap or
  indexing-strategy refinement.

- **`<meta name="description">` in `apps/arena-client/index.html`:**
  ```html
  <meta name="description" content="Legendary Arena — the digital deck-building arena. The arena awaits." />
  ```
  Copy aligns with the marketing-site home tagline ("The arena
  awaits.") locked under WP-004 (`docs/01-VISION.md` Decisions log
  2026-05-08). Position: in `<head>`, after `<meta name="viewport">`
  and before `<title>` — placement is conventional and does not
  conflict with the WP-007a Step 3-locked brand-tokens consumption
  block (which lives below `<title>`).

- **`<head>` shape after this EC:**
  ```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="..." />
    <title>Legendary Arena</title>
    <!-- WP-007a brand-token consumption ... -->
    <link rel="stylesheet" href="/brand-tokens.local.css" />
    <link rel="stylesheet" href="https://www.legendary-arena.com/brand-tokens.css" />
  </head>
  ```

## Guardrails

- **No copy expansion beyond meta-description.** OG / Twitter /
  Schema.org JSON-LD / canonical / favicons are all Lighthouse-SEO-
  improving but they are NOT required for the ≥ 90 floor and
  are scope of WP-008 (the dedicated marketing-site SEO baseline WP)
  or a future arena-client-specific SEO WP. WP-007a's DoD is
  satisfied by closing the two specific failed audits.
- **No `_redirects` change.** The CF Pages lint warning on
  `/*  /index.html  200` ("infinite loop detected") is documented
  as a known CF Pages quirk; CF's default SPA fallback covers the
  use case and the live URL passes the deep-path SPA-shell check.
  WP-007a Step 8 prescribed the file verbatim; not changing it
  preserves the WP-007a Step 8 contract. The CF Pages quirk will be
  recorded in the marketing-repo `01-VISION.md` Decisions log entry
  at WP-007a lock.
- **No engine code change.** `packages/`, `apps/server/`,
  `apps/registry-viewer/`, etc. byte-identical to HEAD.
- **No new runtime npm dependencies.** `pnpm-lock.yaml`
  byte-identical to HEAD.
- **No vite.config.ts / tsconfig change.** Both files locked under
  WP-144 (D-14401) and not relevant here.

## Required `// why:` Comments

None. The two artifacts are static text; their content is documented
in this EC's "Locked Values" section and (for the meta-description)
in the Decisions log entry that lands at WP-007a lock. Adding a
`// why:` to either would be noise (HTML / robots.txt do not
otherwise need rationale; the rationale is the WP-007a DoD bullet).

## Files to Produce

**Created:**
- `apps/arena-client/public/robots.txt` — two-line allow-all robots.txt
- `docs/ai/execution-checklists/EC-148-arena-client-seo-errata.checklist.md`
  (this file)

**Modified:**
- `apps/arena-client/index.html` — one `<meta name="description">`
  line added inside `<head>`, between viewport and title
- `docs/ai/execution-checklists/EC_INDEX.md` — Phase 7 row added for
  EC-148

**Explicitly NOT touched** (verify via `git diff --stat <those paths>`
shows empty): all paths under `packages/`, `apps/server/`,
`apps/arena-client/src/`, `apps/arena-client/package.json`,
`apps/arena-client/vite.config.ts`, `apps/arena-client/tsconfig*.json`,
`apps/arena-client/public/_redirects`,
`apps/arena-client/public/brand-tokens.local.css`, `apps/registry-viewer/`,
`apps/replay-producer/`, `apps/wiki-viewer/`, `data/`, `scripts/`,
root `package.json`, `pnpm-lock.yaml`, root `tsconfig.json`,
`render.yaml`.

## After Completing

- [ ] `apps/arena-client/public/robots.txt` exists with exact
      two-line content
- [ ] `apps/arena-client/index.html` `<head>` contains
      `<meta name="description" ...>` line per Locked Values
- [ ] `pnpm --filter "@legendary-arena/arena-client..." build`
      succeeds; `dist/robots.txt` exists with SAME content as source;
      `dist/index.html` contains the meta description
- [ ] Per-machine determinism preserved: two consecutive builds
      produce byte-identical `apps/arena-client/dist/`
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] `git diff --stat packages/ apps/server/ apps/arena-client/src/
      apps/arena-client/package.json apps/registry-viewer/
      apps/replay-producer/ apps/wiki-viewer/ data/ scripts/` empty
- [ ] After commit + push to `main`, CF Pages auto-redeploys
      `legendary-arena-play`
- [ ] After CF redeploy, `curl -I
      https://play.legendary-arena.com/robots.txt` returns `200`
      with `Content-Type: text/plain` (NOT `text/html` — the SPA
      fallback no longer catches `/robots.txt`); body is the verbatim
      two-line allow-all string
- [ ] After CF redeploy,
      `https://play.legendary-arena.com/`'s rendered HTML contains
      the `<meta name="description">` line
- [ ] Lighthouse re-run on the live URL: `npx lighthouse@12
      https://play.legendary-arena.com/ --output=json
      --output-path=lighthouse-play-wp007a.json
      --only-categories=performance,accessibility,best-practices,seo`
      reports SEO ≥ 90 (the 82 baseline rises to 100 if both audits
      flip from 0 to 1)
- [ ] All four Lighthouse categories ≥ 90 — WP-007a DoD bullet
      satisfied

## Common Failure Smells

- **CF Pages catches /robots.txt with the SPA fallback again** —
  shouldn't happen, because Vite copies `public/robots.txt` verbatim
  into `dist/robots.txt`, and CF Pages serves real files before
  falling back to the SPA shell. If this regresses, confirm Vite
  copied the file (check `apps/arena-client/dist/robots.txt` after
  build) and that CF's deploy log shows it under "Uploaded N files."
- **Meta description appears in index.html source but Lighthouse
  still reports 0** — the audit fails if `content` is empty or
  whitespace-only. Verify the locked value matches verbatim and the
  Vite output `dist/index.html` contains the same content (Vite does
  not strip meta tags).
- **Lighthouse re-run shows SEO=92 instead of 100** — possible if
  one of the audits scores partial credit. The DoD bullet only
  requires ≥ 90; 92 is a pass.
- **`Compare-Object` over `dist/` shows new files but no old files
  removed** — expected. `robots.txt` is a new file; `index.html`
  bytes change. The previous "12 files" baseline becomes 13 after
  this EC, and `index.html`'s hash changes by exactly the meta
  description line.
