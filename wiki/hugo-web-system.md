---
title: Hugo Web System
type: Guide
tags:
  - hugo
  - papermod
  - marketing-site
  - partials
  - pagefind
  - designer-reference
related:
  - architecture-inventory.md
  - wiki-viewer.md
  - brevo-email-pipeline.md
status: draft
source:
  - C:\www\legendary-arena-com\hugo.toml
  - C:\www\legendary-arena-com\layouts\baseof.html
  - C:\www\legendary-arena-com\layouts\_partials\header.html
  - C:\www\legendary-arena-com\layouts\_partials\footer.html
  - C:\www\legendary-arena-com\layouts\_partials\extend_head.html
  - C:\www\legendary-arena-com\layouts\index.html
last-reviewed: 2026-05-13
---

## Repository base URLs

| Repo | Base URL (local) | Site |
|---|---|---|
| Engine | `C:\pcloud\BB\DEV\legendary-arena\` | `ewiki.legendary-arena.com` |
| Marketing | `C:\www\legendary-arena-com\` | `www.legendary-arena.com` |
| Research / Notes | `C:\pcloud\LA\ewiki\` | (not published) |

### Where files are drafted and where they get published

The Hugo web system files all live in the **marketing repo**. This
wiki page (in the engine repo) is a companion reference only.

**Drafting locations** — where you edit files locally before
committing:

| File | Repo | Draft location (local) |
|---|---|---|
| Site config | Marketing | `C:\www\legendary-arena-com\hugo.toml` |
| Base template | Marketing | `C:\www\legendary-arena-com\layouts\baseof.html` |
| Home page | Marketing | `C:\www\legendary-arena-com\layouts\index.html` |
| Header partial | Marketing | `C:\www\legendary-arena-com\layouts\_partials\header.html` |
| Footer partial | Marketing | `C:\www\legendary-arena-com\layouts\_partials\footer.html` |
| Head extensions | Marketing | `C:\www\legendary-arena-com\layouts\_partials\extend_head.html` |
| Brand tokens CSS | Marketing | `C:\www\legendary-arena-com\static\brand-tokens.css` |
| Content pages | Marketing | `C:\www\legendary-arena-com\content\` |
| Static images | Marketing | `C:\www\legendary-arena-com\static\images\` |
| This wiki page | Engine | `C:\pcloud\BB\DEV\legendary-arena\wiki\hugo-web-system.md` |
| Screenshots for this page | Engine | `C:\pcloud\BB\DEV\legendary-arena\ewiki\hugo-web-system\` |

**Published locations** — where files end up after `git push` and
deploy:

| File | Published at |
|---|---|
| Marketing repo site files | Deployed to `www.legendary-arena.com` via Cloudflare Pages |
| This wiki page | Published to `ewiki.legendary-arena.com/hugo-web-system/` via Render |
| Screenshots | Published to `ewiki.legendary-arena.com/hugo-web-system/` via Render |

If this wiki page and the marketing repo files disagree, the marketing
repo is authoritative.

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

Hugo reads Markdown content from `C:\www\legendary-arena-com\content\`,
applies the template hierarchy, and emits static HTML into
`C:\www\legendary-arena-com\public\`. The production build includes a
Pagefind indexing step:

```
content/*.md -> Hugo templates -> public/*.html -> Pagefind indexer -> public/pagefind/
```

The site deploys via Cloudflare Pages.

### Template hierarchy

Hugo resolves templates using a lookup order where project-level files
override theme files. The marketing site overrides five PaperMod
templates:

| File | Draft location | Purpose |
|---|---|---|
| Base template | `C:\www\legendary-arena-com\layouts\baseof.html` | Page skeleton — injects header, main content region, footer |
| Home page | `C:\www\legendary-arena-com\layouts\index.html` | Home page (WP-004) |
| Header | `C:\www\legendary-arena-com\layouts\_partials\header.html` | Global navigation + Pagefind search stub |
| Footer | `C:\www\legendary-arena-com\layouts\_partials\footer.html` | Footer nav + copyright + scripts |
| Head extensions | `C:\www\legendary-arena-com\layouts\_partials\extend_head.html` | Brand tokens, web fonts, Pagefind lazy-load, Schema.org |

### Base template (`baseof.html`)

Defines the global page skeleton. Every page on the site inherits
this structure:

```
<html>
  <head> -> partial "head.html" (theme) + partial "extend_head.html" (project)
  <body>
    partial "header.html"            <- global nav
    <main data-pagefind-body>        <- content region (Pagefind indexes only this)
      block "main"                   <- page-specific content injected here
    </main>
    partial "footer.html"            <- footer nav + scripts
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
   `C:\www\legendary-arena-com\hugo.toml`. External links get an
   outbound-link SVG icon. Active page gets `<span class="active">`.
3. **Search** — `<div id="la-search">` containing a stub `<input>`
   that renders server-side for first-paint visibility. Pagefind's UI
   lazy-loads on first interaction (focus, click, or `/` / `Ctrl+K`
   shortcut) and replaces the stub.

The canonical search element id `la-search` is locked by WP-005.

### Footer partial (`footer.html`)

The footer has two regions:

1. **Footer nav** — `<nav class="footer-nav">` iterating
   `site.Menus.footer` from `C:\www\legendary-arena-com\hugo.toml`
   (WP-010). External links carry
   `target="_blank" rel="noopener noreferrer"` and the same outbound
   SVG icon used by the header.
2. **Upstream PaperMod content** — copyright line, optional footer
   text, Hugo/PaperMod attribution, scroll-to-top button, theme
   toggle script, code copy button script.

### Head extensions (`extend_head.html`)

Injected into `<head>` on every page. Four sections:

1. **Brand tokens** — `<link>` to
   `C:\www\legendary-arena-com\static\brand-tokens.css` (must load
   before custom CSS so `var(--la-*)` tokens resolve).
2. **Web fonts** — Google Fonts: Bebas Neue (display), Inter 400-700
   (body), JetBrains Mono 400 (code). Uses `display=optional`
   (WP-011) to eliminate font-swap CLS.
3. **Pagefind lazy-load** — ~300 KB of Pagefind assets load only on
   user intent. Keyboard shortcuts: `/` and `Ctrl+K` / `Cmd+K`.
4. **Schema.org** — JSON-LD structured data, production builds only
   (WP-008).

### Navigation menus

Defined in `C:\www\legendary-arena-com\hugo.toml` and consumed by
the header and footer partials:

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
C:\www\legendary-arena-com\content\
  _index.md          -> home page (/)
  about\
    _index.md        -> /about/
  brand\
    _index.md        -> /brand/
  posts\
    *.md             -> /posts/<slug>/
```

### Designer constraints

- **Changes to partials affect every page.**
  `C:\www\legendary-arena-com\layouts\_partials\header.html` and
  `C:\www\legendary-arena-com\layouts\_partials\footer.html` are
  shared via `partialCached` — a change to either propagates
  site-wide.
- **Do not duplicate header/footer in individual pages.** The base
  template injects them automatically.
- **Do not edit theme files directly.** Project-level overrides in
  `C:\www\legendary-arena-com\layouts\` take precedence. Theme
  upgrades are copy-and-merge against upstream PaperMod.
- **Raw HTML in Markdown is enabled**
  (`markup.goldmark.renderer.unsafe = true`) for the `/brand/` page's
  collapsibles, swatch grids, and icon checklists. Other pages use
  pure Markdown.
- **Pagefind search requires a production build** (`npm run build`).
  `hugo server` (dev mode) does not generate the
  `C:\www\legendary-arena-com\public\pagefind\` directory.

### Commit prefix conventions

Edits to marketing repo files use different prefixes depending on
what you're changing. See [Wiki Viewer](wiki-viewer.md) for the full
prefix table.

| Prefix | When |
|---|---|
| `WP-NNN:` | Site-affecting changes (layouts, config, templates) |
| `FIX:` | Content-lane edits — typo, copy tweak, broken link (only `content\**` + `static\images\**`) |
| `POST:` | New blog post |
| `INFRA:` | Tooling, hooks, CI, scripts |

Full details: `C:\www\legendary-arena-com\docs\ai\REFERENCE\01.3-commit-hygiene.md`.

## Interactions

- **Pagefind** — search indexing is scoped by `data-pagefind-body` on
  `<main>` in `C:\www\legendary-arena-com\layouts\baseof.html`. The
  lazy-load script in
  `C:\www\legendary-arena-com\layouts\_partials\extend_head.html`
  mounts `PagefindUI` into `#la-search` in the header. These two
  files must stay coordinated.
- **PaperMod theme** — five overrides shadow upstream templates. Theme
  upgrades require diffing the override against the new upstream
  version.
- **Brand tokens** —
  `C:\www\legendary-arena-com\static\brand-tokens.css` defines
  `--la-*` CSS custom properties consumed by both the theme's
  `custom.css` and the partials. Changes to token names break
  downstream references.
- **Schema.org / SEO** —
  `C:\www\legendary-arena-com\layouts\_partials\extend_head.html`
  loads `seo/schema.html` in production. The Schema.org partial reads
  `params.schema` from `C:\www\legendary-arena-com\hugo.toml`.
- **Google Fonts** — loaded in
  `C:\www\legendary-arena-com\layouts\_partials\extend_head.html` with
  `display=optional`. Font family changes must update both the
  Google Fonts URL and the `--la-font-*` tokens in
  `C:\www\legendary-arena-com\static\brand-tokens.css`.
- [Brevo Email Pipeline](brevo-email-pipeline.md) — email design
  colors reference the same brand tokens. The subscribe form on the
  marketing site feeds into the Brevo pipeline.

## Edge Cases

- **Trailing slash mismatch** — menu URLs in
  `C:\www\legendary-arena-com\hugo.toml` without a trailing slash
  silently break the active-state `<span class="active">` highlight.
  No error is raised.
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
  the `partialCached` call in
  `C:\www\legendary-arena-com\layouts\baseof.html`.

## References

- `C:\www\legendary-arena-com\hugo.toml` — site config, menus, markup settings
- `C:\www\legendary-arena-com\layouts\baseof.html` — page skeleton with `data-pagefind-body`
- `C:\www\legendary-arena-com\layouts\_partials\header.html` — nav + search stub
- `C:\www\legendary-arena-com\layouts\_partials\footer.html` — footer nav + scripts
- `C:\www\legendary-arena-com\layouts\_partials\extend_head.html` — fonts, tokens, Pagefind, Schema.org
- `C:\www\legendary-arena-com\layouts\index.html` — home page override
- `C:\www\legendary-arena-com\static\brand-tokens.css` — cross-site brand token contract
- `C:\www\legendary-arena-com\docs\ai\REFERENCE\01.3-commit-hygiene.md` — commit prefix conventions
- WP-004 — home page override
- WP-005 — Pagefind search integration, `#la-search` id lock
- WP-008 — Schema.org / SEO baseline
- WP-010 — footer nav
- WP-011 — `display=optional` CLS fix
- WP-014 — `/brand/` page, `unsafe = true` for raw HTML in Markdown
