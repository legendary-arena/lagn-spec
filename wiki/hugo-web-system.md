---
title: Hugo Web System
type: System
tags:
  - hugo
  - papermod
  - marketing-site
  - partials
  - pagefind
  - designer-reference
related:
  - architecture-inventory.md
status: draft
source:
  - ../docs/ai/work-packets/WP-004-home-page.md
  - ../docs/ai/work-packets/WP-005-search.md
  - ../docs/ai/work-packets/WP-008-seo-baseline.md
  - ../docs/ai/work-packets/WP-010-footer-nav.md
  - ../docs/ai/work-packets/WP-011-cls-fix.md
  - ../docs/ai/work-packets/WP-014-brand-page.md
last-reviewed: 2026-05-12
---

## Summary

The marketing site at `www.legendary-arena.com` is a Hugo static site
using the PaperMod theme with project-level layout overrides. Hugo
converts Markdown content into HTML pages through a template
composition pipeline: content files feed into page templates, which
inherit from a base layout, which injects reusable partials (header,
footer, search, SEO). A third-party designer needs to understand this
pipeline to know where changes propagate and what constraints apply.

## Mechanics

### Build pipeline

Hugo reads Markdown content from `content/`, applies the template
hierarchy, and emits static HTML into `public/`. The production build
includes a Pagefind indexing step:

```
content/*.md → Hugo templates → public/*.html → Pagefind indexer → public/pagefind/
```

The site deploys via Cloudflare Pages from the
`legendary-arena/legendary-arena-website` repo.

### Template hierarchy

Hugo resolves templates using a lookup order where project-level files
override theme files. The marketing site overrides five PaperMod
templates:

| File | Overrides | Purpose |
|---|---|---|
| `layouts/baseof.html` | `themes/PaperMod/layouts/baseof.html` | Page skeleton — injects header, main content region, footer |
| `layouts/index.html` | `themes/PaperMod/layouts/index.html` | Home page (WP-004) |
| `layouts/_partials/header.html` | `themes/PaperMod/layouts/_partials/header.html` | Global navigation + Pagefind search stub |
| `layouts/_partials/footer.html` | `themes/PaperMod/layouts/_partials/footer.html` | Footer nav + copyright + scripts |
| `layouts/_partials/extend_head.html` | `themes/PaperMod/layouts/_partials/extend_head.html` | Brand tokens, web fonts, Pagefind lazy-load, Schema.org |

### Base template (`baseof.html`)

Defines the global page skeleton. Every page on the site inherits
this structure:

```
<html>
  <head> → partial "head.html" (theme) + partial "extend_head.html" (project)
  <body>
    partial "header.html"            ← global nav
    <main data-pagefind-body>        ← content region (Pagefind indexes only this)
      block "main"                   ← page-specific content injected here
    </main>
    partial "footer.html"            ← footer nav + scripts
  </body>
</html>
```

The `data-pagefind-body` attribute on `<main>` is the Pagefind content
boundary (WP-005): only content inside this element is search-indexed.
Header, footer, and nav chrome are naturally excluded.

### Header partial (`header.html`)

The header renders three flex children inside `<nav class="header-nav">`:

1. **Logo region** — site title link, optional icon, theme toggle
   button (dark/light/auto), language switcher (if multilingual).
2. **Menu** — `<ul id="menu">` iterating `site.Menus.main` from
   `hugo.toml`. External links get an outbound-link SVG icon. Active
   page gets `<span class="active">`.
3. **Search** — `<div id="la-search">` containing a stub `<input>`
   that renders server-side for first-paint visibility. Pagefind's UI
   lazy-loads on first interaction (focus, click, or `/` / `Ctrl+K`
   shortcut) and replaces the stub.

The canonical search element id `la-search` is locked by WP-005.

### Footer partial (`footer.html`)

The footer has two regions:

1. **Footer nav** — `<nav class="footer-nav">` iterating
   `site.Menus.footer` from `hugo.toml` (WP-010). External links
   carry `target="_blank" rel="noopener noreferrer"` and the same
   outbound SVG icon used by the header.
2. **Upstream PaperMod content** — copyright line, optional footer
   text, Hugo/PaperMod attribution, scroll-to-top button, theme
   toggle script, code copy button script.

### Head extensions (`extend_head.html`)

Injected into `<head>` on every page. Four sections:

1. **Brand tokens** — `<link>` to `/brand-tokens.css` (must load
   before custom CSS so `var(--la-*)` tokens resolve).
2. **Web fonts** — Google Fonts: Bebas Neue (display), Inter 400-700
   (body), JetBrains Mono 400 (code). Uses `display=optional`
   (WP-011) to eliminate font-swap CLS.
3. **Pagefind lazy-load** — ~300 KB of Pagefind assets load only on
   user intent. Keyboard shortcuts: `/` and `Ctrl+K` / `Cmd+K`.
4. **Schema.org** — JSON-LD structured data, production builds only
   (WP-008).

### Navigation menus

Defined in `hugo.toml` and consumed by the header and footer partials:

**Header menu (`menu.main`):**

| Item | URL | Weight |
|---|---|---|
| About | `/about/` | 10 |
| Blog | `/posts/` | 20 |
| Brand | `/brand/` | 30 |

**Footer menu (`menu.footer`):**

| Item | URL | Weight |
|---|---|---|
| About | `/about/` | 10 |
| Blog | `/posts/` | 20 |
| Brand | `/brand/` | 25 |
| Play | `https://play.legendary-arena.com/` | 30 |
| Cards | `https://cards.barefootbetters.com/` | 40 |

Trailing slashes on internal URLs are required — the header partial
does exact string comparison for active-state styling.

### Content structure

```
content/
  _index.md          → home page (/)
  about/
    _index.md        → /about/
  brand/
    _index.md        → /brand/
  posts/
    *.md             → /posts/<slug>/
```

### Designer constraints

- **Changes to partials affect every page.** Header and footer are
  shared via `partialCached` — a change to `header.html` propagates
  site-wide.
- **Do not duplicate header/footer in individual pages.** The base
  template injects them automatically.
- **Do not edit theme files directly.** Project-level overrides in
  `layouts/` take precedence. Theme upgrades are copy-and-merge
  against upstream PaperMod.
- **Raw HTML in Markdown is enabled** (`markup.goldmark.renderer.unsafe = true`)
  for the `/brand/` page's collapsibles, swatch grids, and icon
  checklists. Other pages use pure Markdown.
- **Pagefind search requires a production build** (`npm run build`).
  `hugo server` (dev mode) does not generate the `/pagefind/`
  directory.

## Interactions

- **Pagefind** — search indexing is scoped by `data-pagefind-body` on
  `<main>` in `baseof.html`. The lazy-load script in
  `extend_head.html` mounts `PagefindUI` into `#la-search` in the
  header. These two files must stay coordinated.
- **PaperMod theme** — five overrides shadow upstream templates. Theme
  upgrades require diffing the override against the new upstream
  version.
- **Brand tokens** — `brand-tokens.css` (in `static/`) defines
  `--la-*` CSS custom properties consumed by both the theme's
  `custom.css` and the partials. Changes to token names break
  downstream references.
- **Schema.org / SEO** — `extend_head.html` loads
  `seo/schema.html` in production. The Schema.org partial reads
  `params.schema` from `hugo.toml`.
- **Google Fonts** — loaded in `extend_head.html` with
  `display=optional`. Font family changes must update both the
  Google Fonts URL and the `--la-font-*` tokens in
  `brand-tokens.css`.

## Edge Cases

- **Trailing slash mismatch** — menu URLs in `hugo.toml` without a
  trailing slash silently break the active-state `<span class="active">`
  highlight. No error is raised.
- **Font swap CLS** — `display=optional` eliminates swap-induced layout
  shift but means slow-connection users see system fonts for the
  entire session. This is intentional (WP-011).
- **Dev vs production search** — Pagefind assets only exist after
  `npm run build`. In dev mode, the lazy-load script silently
  swallows the 404. The stub `<input>` remains visible but
  non-functional.
- **partialCached scope** — the header is cached by `.Page`, the
  footer by `.Layout`, `.Kind`, `hideFooter`, and
  `ShowCodeCopyButtons`. A new cache key dimension requires updating
  the `partialCached` call in `baseof.html`.

## References

- WP-004 — home page override (`layouts/index.html`)
- WP-005 — Pagefind search integration, `#la-search` id lock
- WP-008 — Schema.org / SEO baseline
- WP-010 — footer nav (`site.Menus.footer`)
- WP-011 — `display=optional` CLS fix
- WP-014 — `/brand/` page, `unsafe = true` for raw HTML in Markdown
- `layouts/baseof.html` — page skeleton with `data-pagefind-body`
- `layouts/_partials/header.html` — nav + search stub
- `layouts/_partials/footer.html` — footer nav + scripts
- `layouts/_partials/extend_head.html` — fonts, tokens, Pagefind, Schema.org
- `hugo.toml` — site config, menus, markup settings
