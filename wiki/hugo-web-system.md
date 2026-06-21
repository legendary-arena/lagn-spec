---
title: Hugo Web System
type: Guide
tags:
  - hugo
  - papermod
  - marketing-site
  - partials
  - pagefind
  - snipcart
  - brevo
  - designer-reference
related:
  - hugo-onboarding.md
  - architecture-inventory.md
  - wiki-viewer.md
  - brevo-email-pipeline.md
status: draft
source:
  - C:\www\legendary-arena-com\hugo.toml
  - C:\www\legendary-arena-com\layouts\baseof.html
  - C:\www\legendary-arena-com\layouts\index.html
  - C:\www\legendary-arena-com\layouts\_partials\header.html
  - C:\www\legendary-arena-com\layouts\_partials\footer.html
  - C:\www\legendary-arena-com\layouts\_partials\extend_head.html
  - C:\www\legendary-arena-com\layouts\_partials\extend_footer.html
  - C:\www\legendary-arena-com\layouts\_partials\newsletter-form.html
  - C:\www\legendary-arena-com\functions\api\subscribe.js
  - C:\www\legendary-arena-com\static\_headers
  - C:\www\legendary-arena-com\static\apple-touch-icon.png
  - C:\www\legendary-arena-com\themes\PaperMod\layouts\_partials\head.html
last-reviewed: 2026-06-20
---

> 👋 **New to this codebase?** Start with
> [Hugo Onboarding](hugo-onboarding.md) — local setup, the
> WordPress→Hugo mental model, and step-by-step recipes for common
> tasks. This page is the deep technical reference it ramps into.

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
| Footer extensions | Marketing | `C:\www\legendary-arena-com\layouts\_partials\extend_footer.html` |
| Newsletter form | Marketing | `C:\www\legendary-arena-com\layouts\_partials\newsletter-form.html` |
| Subscribe API (CF Pages Function) | Marketing | `C:\www\legendary-arena-com\functions\api\subscribe.js` |
| Brand tokens CSS | Marketing | `C:\www\legendary-arena-com\static\brand-tokens.css` |
| Favicon set | Marketing | `C:\www\legendary-arena-com\static\favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `safari-pinned-tab.svg` |
| Edge headers | Marketing | `C:\www\legendary-arena-com\static\_headers` |
| Edge redirects | Marketing | `C:\www\legendary-arena-com\static\_redirects` (does not exist yet — see [Edge configuration](#edge-configuration-_headers--_redirects)) |
| Content pages | Marketing | `C:\www\legendary-arena-com\content\` |
| Static images | Marketing | `C:\www\legendary-arena-com\static\images\` |
| This wiki page | Engine | `C:\pcloud\BB\DEV\legendary-arena\wiki\hugo-web-system.md` |
| Screenshots for this page | Engine | `C:\pcloud\BB\DEV\legendary-arena\ewiki\hugo-web-system\` |

**Published locations** — where files end up after `git push` and
deploy:

| File | Published at |
|---|---|
| Marketing repo site files | Deployed to `www.legendary-arena.com` via Cloudflare Pages |
| CF Pages Functions (`functions/api/*`) | Deployed as edge functions at `https://www.legendary-arena.com/api/*` by Cloudflare Pages (same deploy) |
| Built images (Hugo output) | `C:\www\legendary-arena-com\public\images\` — Hugo writes here during build by copying from `static\images\`. Do NOT save images here manually; the directory is regenerated on each build and manual files get overwritten or end up untracked. Manual saves go in `C:\www\legendary-arena-com\static\images\`. |
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
footer, search, SEO). On top of the static pipeline the site runs three
commercial systems a designer must know about:

- **Snipcart** (WP-019) — client-side e-commerce for the `/shop/`
  section: a cart button in the header, the SDK in the head/footer, and
  a public API key in `hugo.toml`.
- **Newsletter capture → Brevo** (WP-015) — an email signup partial that
  posts to a Cloudflare Pages Function (`/api/subscribe`), which creates
  the contact in Brevo.
- **Pagefind** (WP-005) — build-time search index served from
  `public/pagefind/`.

A third-party designer needs to understand the template pipeline to know
where changes propagate, and the commercial systems to avoid breaking
conversion paths.

## Mechanics

### Build pipeline

Hugo reads Markdown content from `C:\www\legendary-arena-com\content\`,
applies the template hierarchy, and emits static HTML into
`C:\www\legendary-arena-com\public\`. The production build (`npm run
build`) chains Hugo and the Pagefind indexer:

```
content/*.md -> Hugo templates -> public/*.html -> Pagefind indexer -> public/pagefind/
```

`package.json` defines it exactly as:

```
"build": "hugo --minify && npx pagefind --site public"
```

The site deploys via Cloudflare Pages. The same deploy also publishes
everything under `C:\www\legendary-arena-com\functions\` as Cloudflare
Pages Functions (edge serverless handlers) — currently just
`functions/api/subscribe.js` at `/api/subscribe`. These functions are
**not** part of the Hugo build; Cloudflare picks up the `functions/`
directory automatically.

> **Minification note for source-diving.** `hugo --minify` strips quotes
> around HTML attribute values in `public/`, so `id="menu"` becomes
> `id=menu` and `name="company"` becomes `name=company`. When grepping
> built output, match the unquoted form.

### Template hierarchy

Hugo resolves templates using a lookup order where project-level files
override theme files. The marketing site carries a substantial set of
overrides and additions in `C:\www\legendary-arena-com\layouts\`:

| File | Draft location | Purpose |
|---|---|---|
| Base template | `layouts\baseof.html` | Page skeleton — injects header, `<main data-pagefind-body>`, footer |
| Home page | `layouts\index.html` | Home override (WP-004): hero + CTA, featured tournaments, featured gear |
| Header | `layouts\_partials\header.html` | Global nav + Snipcart cart button + Pagefind search stub |
| Footer | `layouts\_partials\footer.html` | Footer nav + newsletter signup + upstream PaperMod content |
| Head extensions | `layouts\_partials\extend_head.html` | Brand tokens, fonts, Pagefind lazy-load, Schema.org, Snipcart CSS |
| Footer extensions | `layouts\_partials\extend_footer.html` | Newsletter JS + Snipcart SDK/mount |
| Newsletter form | `layouts\_partials\newsletter-form.html` | Reusable email-capture form (parameterized) |
| SEO / Schema | `layouts\_partials\seo\schema.html` + `layouts\_partials\templates\schema_json.html` | Organization + WebSite JSON-LD (WP-008) |
| CTA block | `layouts\_partials\cta-block.html` | Reusable call-to-action partial |
| Section layouts | `layouts\shop\`, `layouts\brand\`, `layouts\tournaments\`, `layouts\leaderboard\`, `layouts\diorama\`, `layouts\single.html` | Per-section list/single templates |

Paths in this table are relative to `C:\www\legendary-arena-com\` for
brevity; the full absolute path is `C:\www\legendary-arena-com\<path>`.

### Base template (`baseof.html`)

Defines the global page skeleton. Every page on the site inherits
this structure:

```
<html>
  <head> -> partial "head.html" (theme) + partial "extend_head.html" (project)
  <body>
    partial "header.html"            <- global nav (partialCached by .Page)
    <main data-pagefind-body>        <- content region (Pagefind indexes only this)
      block "main"                   <- page-specific content injected here
    </main>
    partial "footer.html"            <- footer nav + newsletter + scripts
  </body>
</html>
```

The `data-pagefind-body` attribute on `<main>` is the Pagefind content
boundary (WP-005): only content inside this element is search-indexed.
Header, footer, and nav chrome are naturally excluded.

The footer is `partialCached` keyed by `.Layout`, `.Kind`,
`hideFooter`, `ShowCodeCopyButtons`, **and `hideFooterNewsletter`**
(WP-024). Adding a new per-page dimension that should bust the footer
cache means adding it to this `partialCached` call.

### Where things load in `<head>` (head composition)

`<head>` is assembled by **two** files, and which one owns a given tag
matters when you go looking for it:

| Concern | Owned by | Production-only? |
|---|---|---|
| Title, description, keywords, canonical | theme `head.html` | no |
| **Favicons** (ico / 16 / 32 / apple-touch / safari-pinned-tab) + `theme-color` | theme `head.html` (lines ~87-94) | no |
| Site-verification meta (Google / Bing / Yandex / Naver) | theme `head.html`, gated on `site.Params.analytics.*` | no (but unset → nothing emitted) |
| Brand tokens CSS, web fonts, Pagefind lazy-load, Snipcart CSS | project `extend_head.html` | mixed (Schema is prod-only) |
| **Google Analytics** | theme `google_analytics.html` | yes |
| **Open Graph** | theme `templates/opengraph.html` | yes |
| **Twitter Cards** | theme `templates/twitter_cards.html` | yes |
| Schema.org JSON-LD (Organization + WebSite) | project `seo/schema.html` via `extend_head.html` | yes |

The theme's `head.html` calls `extend_head.html` partway through, then
emits the production-gated block (GA, OG, Twitter, schema_json) last.
**Key takeaway:** social tags, analytics, and Schema all live behind the
`hugo.IsProduction | or (eq site.Params.env "production")` gate, so they
are absent under `hugo server` and only appear in `npm run build`
output. Validate them against a built site, never the dev server (see
[Local development](#local-development)).

### Header partial (`header.html`)

The header renders four flex children inside `<nav class="header-nav">`:

1. **Logo region** — site title link, optional logo image, theme toggle
   button (dark/light/auto), language switcher (if multilingual). The
   logo image branch uses Hugo's `.Resize` on a `resources.Get`
   asset (`site.Params.label.icon`); `params.label.icon` is currently
   unset, so the logo renders as the text site title.
2. **Menu** — `<ul id="menu">` iterating `site.Menus.main` from
   `hugo.toml`. External links (matched via `findRE "://"`) get an
   outbound-link SVG icon. Active page gets `<span class="active">`.
3. **Snipcart cart button** (WP-019) — `<button class="snipcart-checkout
   header-cart">`. `.snipcart-checkout` is a Snipcart-reserved class
   that opens the cart; `.snipcart-items-count` is auto-populated by
   Snipcart JS.
4. **Search** — `<div id="la-search">` containing a stub `<input
   id="la-search-stub">` that renders server-side for first-paint
   visibility. Pagefind's UI lazy-loads on first interaction (focus,
   click, or `/` / `Ctrl+K` shortcut) and replaces the stub.

The canonical search element id `la-search` is locked by WP-005.

> **External header links open in the same tab.** Unlike the footer
> partial, `header.html` does **not** add `target="_blank"
> rel="noopener"` to external menu items. The Play and Cards entries
> (added to `menu.main` to surface conversion paths in the header) are
> external and therefore open in the same tab. That is intentional for
> Play (a destination, not a reference link). If same-tab is ever wrong
> for these, the fix is in `header.html`, not `hugo.toml`.

### Footer partial (`footer.html`)

The footer has, in order:

1. **Footer nav** — `<nav class="footer-nav">` iterating
   `site.Menus.footer` from `hugo.toml` (WP-010). External links carry
   `target="_blank" rel="noopener noreferrer"` and the same outbound
   SVG icon used by the header.
2. **Newsletter signup** (WP-015) — a `<div class="footer-newsletter">`
   that calls the `newsletter-form.html` partial. Shown site-wide,
   suppressible per page via `hideFooterNewsletter: true` front matter
   (WP-024) so a landing page with its own signup doesn't show the
   opt-in twice. See [Email capture](#email-capture-newsletter--brevo).
3. **Upstream PaperMod content** — copyright line, optional footer
   text, Hugo/PaperMod attribution, scroll-to-top button, theme
   toggle script, code copy button script.

Below the visible footer, `footer.html` calls `extend_footer.html`,
which loads the fingerprinted newsletter JS and the Snipcart SDK +
mount point.

### Head extensions (`extend_head.html`)

Injected into `<head>` on every page (called by the theme's `head.html`).
Five sections:

1. **Brand tokens** — `<link>` to
   `C:\www\legendary-arena-com\static\brand-tokens.css` (must load
   before custom CSS so `var(--la-*)` tokens resolve).
2. **Web fonts** — Google Fonts: Bebas Neue (display), Inter 400-700
   (body), JetBrains Mono 400 (code). Uses `display=optional`
   (WP-011) to eliminate font-swap CLS.
3. **Pagefind lazy-load** — ~300 KB of Pagefind assets load only on
   user intent. Keyboard shortcuts: `/` and `Ctrl+K` / `Cmd+K`.
4. **Schema.org** — JSON-LD structured data, production builds only
   (WP-008), via `partial "seo/schema.html"`.
5. **Snipcart CSS** (WP-019) — preconnect to the Snipcart CDN and load
   the default cart theme stylesheet. The Snipcart JS is loaded
   separately (deferred) in `extend_footer.html`.

### Footer extensions (`extend_footer.html`)

Loaded at the end of `<body>` by `footer.html`:

1. **Newsletter JS** — `assets/js/newsletter.js`, minified +
   fingerprinted + deferred. Progressive enhancement over the
   `newsletter-form.html` POST (see below).
2. **Snipcart SDK + mount** (WP-019) — a hidden `<div id="snipcart"
   data-api-key="...">` (the **public** key from
   `site.Params.snipcartApiKey`) plus the async Snipcart `snipcart.js`
   from the CDN.

### Commerce (Snipcart) {#commerce-snipcart}

E-commerce for the `/shop/` section is handled entirely client-side by
**Snipcart v3** (WP-019). The moving parts:

| Piece | Location |
|---|---|
| Public API key | `hugo.toml` → `[params]` `snipcartApiKey` (public, safe to commit) |
| Cart stylesheet + preconnect | `extend_head.html` §5 |
| Cart SDK + mount `<div id="snipcart">` | `extend_footer.html` |
| Header cart button | `header.html` (`.snipcart-checkout` + `.snipcart-items-count`) |
| Product pages | `content\shop\` + `layouts\shop\` (list + single) |
| Featured gear on home | `layouts\index.html` pulls `content/shop` items with `featured: true` |

Snipcart reads product price/id/url from `data-item-*` attributes that
the shop templates emit. The key in `hugo.toml` is the publishable key;
there is no server-side secret in the static site for Snipcart.

### Email capture (newsletter → Brevo) {#email-capture-newsletter--brevo}

Lead capture is a **Hugo layout partial**, not a shortcode:
`C:\www\legendary-arena-com\layouts\_partials\newsletter-form.html`
(WP-015). It is parameterized via a `dict` and reused in more than one
place:

```
{{ partial "newsletter-form.html" (dict
     "id" "footer"
     "heading" "Newsletter"
     "description" "Patch notes and new cards, straight to your inbox.") }}
```

Parameters: `id` (required — makes field ids unique when multiple forms
are on one page), `heading`, `description`, and `source` (optional
provenance label; defaults to `.id`).

**Where it is injected:**

- **Footer** — sitewide via `footer.html`, suppressible per page with
  `hideFooterNewsletter: true` (WP-024).
- It is a partial, so any layout can embed it. (The home page,
  `layouts/index.html`, does not embed its own copy — the newsletter a
  visitor sees on the home page is the footer instance.)

**Submission path:**

```
newsletter-form.html (POST /api/subscribe, or fetch() with JS)
   -> functions/api/subscribe.js  (Cloudflare Pages Function)
   -> Brevo Contacts API (api.brevo.com/v3/contacts)
```

`assets/js/newsletter.js` progressively enhances the form: it
`preventDefault`s the native submit and sends a JSON `fetch()` with
inline success/error messaging. The CF Function:

- accepts **only** `Content-Type: application/json` (a native non-JS
  form POST sends `x-www-form-urlencoded` and is rejected 415 — the
  "works without JS" intent in the partial's comment is not currently
  true end-to-end);
- validates the email, normalizes it (`trim().toLowerCase()`);
- creates/updates the contact on `BREVO_LIST_ID` with
  `updateEnabled: true` (re-subscribes don't error);
- best-effort attaches a `SIGNUP_SOURCE` attribute from the `source`
  field, retrying once without it if Brevo hasn't provisioned the
  attribute (lead capture must not fail on a missing attribute);
- reads secrets from CF Pages env: `BREVO_API_KEY`, `BREVO_LIST_ID`.

See [Brevo Email Pipeline](brevo-email-pipeline.md) for account config
and the full attribute map.

#### Spam protection {#spam-protection}

The newsletter endpoint has three layers, in order of strength:

1. **Origin allowlist** — `subscribe.js` only echoes CORS for
   `www.legendary-arena.com` and the two localhost dev origins; any
   other origin falls back to the production origin.
2. **Input validation** — content-type must be JSON; email must pass a
   format regex.
3. **Honeypot** — `newsletter-form.html` includes an off-screen
   `company` text field (`<div class="newsletter-hp">`, positioned
   `left:-9999px`, `aria-hidden`, `tabindex="-1"`, `autocomplete="off"`).
   Real users never see or fill it. `subscribe.js` silently returns a
   fake `{ ok: true }` (and never calls Brevo) when `company` is
   non-empty, so a caught bot gets no signal to adapt. `newsletter.js`
   forwards the field only if it was filled.

**Honeypot limitations (be honest about these):**

- It catches **form-scraping bots** that fill every input. It does
  **not** stop a bot that POSTs straight to `/api/subscribe` without the
  `company` field — that path is gated only by the origin allowlist and
  email validation.
- The field name `company` is not a standard browser autofill token and
  carries `autocomplete="off"`, which minimizes (but cannot 100%
  guarantee) that a password manager / autofill never populates it for a
  real user. A populated honeypot silently drops the signup, so if false
  positives ever surface, this is the first suspect.
- There is **no CAPTCHA / Turnstile / rate limiting**. If bot volume
  becomes a real problem, Cloudflare Turnstile (a CF-native, low-friction
  widget) is the natural next layer — a deliberate, separate decision,
  not yet made.

### Analytics & conversion tracking {#analytics--conversion-tracking}

**Current state: no analytics platform is configured.** This is a
deliberate deferral, not an oversight — `docs/03-ROADMAP.md` lists the
platform choice ("Cloudflare Web Analytics, Plausible, or none") as an
open "Beyond" decision, and WP-021 (funnel analytics baseline) shipped
its instrumentation conventions while explicitly **deferring** platform
selection.

What *is* wired (and where a tag would go):

| Capability | Mechanism | Status |
|---|---|---|
| Google Analytics | theme `google_analytics.html`, prod-gated in `head.html` | dormant — emits nothing until GA is configured in `hugo.toml` (`googleAnalytics`/`[services.googleAnalytics]`) |
| Search-console verification | theme `head.html`, gated on `site.Params.analytics.{google,bing,yandex,naver}.SiteVerificationTag` | dormant — no `[params.analytics]` block exists |
| Arbitrary pixel (PostHog, Meta/`fbq`, Plausible, CF Web Analytics) | none | **not present** — would be added as a `<script>` in `extend_head.html` (head) or `extend_footer.html` (deferred, end of body) |

When a platform is chosen, the injection point is one of the two
project-owned head/footer partials above (or native Hugo GA config) —
production-gate it the same way the OG/Schema blocks are gated so it
never fires under `hugo server`. Do not scatter inline trackers into
content pages.

### Social sharing (Open Graph & Twitter Cards) {#social-sharing-open-graph--twitter-cards}

**PaperMod handles these automatically — no `extend_head.html` override
is needed.** The theme `head.html` emits, in production only:

- `partial "templates/opengraph.html"` — `og:title`, `og:description`,
  `og:image`, `og:type`, etc.
- `partial "templates/twitter_cards.html"` — `twitter:card`,
  `twitter:title`, `twitter:image`, etc.

Sources, in precedence order:

- **Title / description** — page front matter, falling back to
  `site.Params.description`.
- **Share image** — per-page `images:` / `cover:` front matter. There is
  **no** site-wide default share image configured (`[params] images` is
  unset), so pages without a `cover`/`images` entry ship OG tags with no
  image. Setting a brand default is a one-line `hugo.toml` addition if
  desired.

Because both partials are production-gated, OG/Twitter tags are **absent
under `hugo server`**. Validate with a built site (see [Local
development](#local-development)) and external validators (Facebook
Sharing Debugger, Twitter Card Validator) against the deployed URL.

### Favicon configuration {#favicon-configuration}

The site ships a **modern favicon set**, not just a legacy `.ico`. All
assets live in `C:\www\legendary-arena-com\static\` and are served at the
site root; the theme's `head.html` (lines ~87-94) references the full
set with no manual `extend_head.html` override required:

| Asset (in `static/`) | `<head>` tag | Purpose |
|---|---|---|
| `favicon.ico` | `<link rel="icon">` | Legacy / fallback |
| `favicon-16x16.png` | `<link rel="icon" sizes="16x16">` | Standard tab icon |
| `favicon-32x32.png` | `<link rel="icon" sizes="32x32">` | Hi-DPI tab icon |
| `apple-touch-icon.png` | `<link rel="apple-touch-icon">` | iOS home-screen icon |
| `safari-pinned-tab.svg` | `<link rel="mask-icon">` | Safari pinned-tab monochrome mask |
| — | `<meta name="theme-color">` + `msapplication-TileColor` (default `#2e2e33`) | Browser/OS chrome tint |

**How to replace an icon:** overwrite the corresponding file in
`static/` with the same filename, commit, and push. Cloudflare Pages
redeploys within ~1 minute. Favicons are aggressively cached by
browsers — force-refresh (Ctrl+Shift+R) to verify, or check headers:

```
curl -I https://www.legendary-arena.com/apple-touch-icon.png
```

**Known gap:** there is **no web app manifest** (`site.webmanifest` /
`manifest.json`) and PaperMod does not emit a `<link rel="manifest">`.
Add one (plus a `192x192` and `512x512` PNG) if/when full PWA /
installable-icon behavior on Android is wanted; today the `theme-color`
+ apple-touch-icon cover the common cases.

### Navigation menus {#navigation-menus}

Defined in `C:\www\legendary-arena-com\hugo.toml` and consumed by the
header and footer partials:

**Header menu (`menu.main`):**

| Item | URL | Weight |
|---|---|---|
| About | `/about/` | 10 |
| Blog | `/posts/` | 20 |
| Tags | `/tags/` | 22 |
| Shop | `/shop/` | 25 |
| Brand | `/brand/` | 30 |
| Play | `https://play.legendary-arena.com/` | 40 |
| Cards | `https://cards.barefootbetters.com/` | 50 |

Play and Cards are the **primary conversion / external destinations**,
surfaced in the header (not just the footer) so account access and the
app aren't buried. The home hero also carries the principal CTA button
(`layouts/index.html`), defaulting to `https://play.legendary-arena.com/`
("Play now"). There is currently **no "Log In" menu item** — the app's
login lives on `play.legendary-arena.com`, and no marketing-site login
URL is defined; add a `[[menu.main]]` entry once a destination exists.

**Footer menu (`menu.footer`):**

| Item | URL | Weight |
|---|---|---|
| About | `/about/` | 10 |
| Blog | `/posts/` | 20 |
| Shop | `/shop/` | 22 |
| Brand | `/brand/` | 25 |
| Play | `https://play.legendary-arena.com/` | 30 |
| Cards | `https://cards.barefootbetters.com/` | 40 |

Trailing slashes on internal URLs are required — the header partial
does exact string comparison for active-state styling.

### Edge configuration (`_headers` / `_redirects`) {#edge-configuration-_headers--_redirects}

Cloudflare Pages reads two special files from the **build output root**.
Because Hugo copies `static/` to `public/` verbatim, the source of truth
for both is `C:\www\legendary-arena-com\static\`:

| File | Status | Current contents / purpose |
|---|---|---|
| `static\_headers` | **exists** | One rule: `/brand-tokens.css` gets `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=3600, must-revalidate` (the cross-site brand-token contract is fetched by other properties). Add caching/security-header rules here. |
| `static\_redirects` | **does not exist** | This is where vanity URLs and marketing redirects (301/302) belong, e.g. `/discord https://discord.gg/... 301`. Create it when the first redirect is needed; until then there are no Pages-level redirects. |

Cloudflare's `_headers`/`_redirects` syntax is plain-text, one rule per
block/line. They are edge config, not Hugo — `hugo server` does not
apply them.

### Image handling & optimization {#image-handling--optimization}

**Current reality:** content images (hero art, product shots, brand
graphics) are hand-authored and dropped into
`C:\www\legendary-arena-com\static\images\` — frequently already
converted to `.webp` (e.g. `static/images/posts/week-01-deck-checklist/
hero.webp`) or authored as `.svg`. Files in `static/` are served
**byte-for-byte with no processing**.

**Important constraint:** Hugo's built-in image processing
(`.Resize`, `.Fit`, `.Fill`, WebP conversion) only works on **page-bundle
resources or files under `assets/`** — it **cannot touch `static/`**. The
only place the site currently uses Hugo image processing is the header
logo path in `header.html` (`resources.Get` + `.Resize "x30"`), which
reads from the resources/assets pipeline.

**If an automated optimization workflow is wanted** (a `{{</* image */>}}`
shortcode that emits resized/WebP variants and `srcset`): it would
require relocating source images out of `static/images/` into either
`assets/images/` or page bundles, then a shortcode wrapping `.Resize` /
`.Process`. That is a real change to the content authoring model — **not
implemented today**, and noted here so the next author doesn't assume a
`static/`-based shortcut exists.

### Embedding video (YouTube) {#embedding-video-youtube}

Embed YouTube with Hugo's built-in **`youtube` shortcode** in content
Markdown — not a hand-written `<iframe>`. It is a core Hugo shortcode (no
PaperMod dependency) and emits a responsive embed.

The id is the `v=` value from the watch URL — for
`https://www.youtube.com/watch?v=5G7DfRmWsG0` the id is `5G7DfRmWsG0`.

**Basic embed:**

```
{{</* youtube 5G7DfRmWsG0 */>}}
```

**With options** (`title` sets the iframe's accessible title; `start`
jumps to a timestamp in seconds):

```
{{</* youtube id=5G7DfRmWsG0 title="Collagen activation & mechanical load" start=335 */>}}
```

Common params: `id`, `title`, `start`, `end`, `autoplay` (off by
default), `mute`, `loading` (`"lazy"`), `controls`, and `class` (setting
`class` drops the default inline responsive styles so you can style it
yourself).

**Where it goes:** any content file under
`C:\www\legendary-arena-com\content\` (a blog post, a landing page).
That is a content-lane edit — commit `POST:` for a new post or `FIX:`
for adding a video to existing content (see
[Commit prefix conventions](#commit-prefix-conventions)).

**Privacy (no-cookie domain).** To make every embed use
`youtube-nocookie.com` instead of `youtube.com`, add this once to
`C:\www\legendary-arena-com\hugo.toml` — it is **not currently set**.
It's site-wide config, so commit it `WP-NNN:`:

```toml
[privacy.youtube]
  privacyEnhanced = true
```

**Two LA-specific notes:**

- **A raw `<iframe>` would also render here.** Unlike a stock Hugo site,
  this one sets `markup.goldmark.renderer.unsafe = true` site-wide (added
  for the `/brand/` page, WP-014), so a pasted iframe is **not** stripped.
  Prefer the shortcode anyway — it is shorter, responsive, and honors the
  privacy setting above; reach for a raw iframe only when you need an
  attribute the shortcode does not expose.
- **It previews on the dev server.** Unlike Pagefind, OG/Twitter, Schema,
  and `/api/subscribe` — all production-gated or build-time (see [Local
  development](#local-development)) — the `youtube` shortcode renders
  under `hugo server` too. What you see in preview is what ships.

**Hugo docs:** the [`youtube` shortcode reference](https://gohugo.io/shortcodes/youtube/)
(full parameter list) and [Configure privacy](https://gohugo.io/configuration/privacy/)
(`[privacy.youtube] privacyEnhanced`).

### Content structure

```
C:\www\legendary-arena-com\content\
  _index.md            -> home page (/)        (rendered by layouts/index.html)
  about\_index.md      -> /about/
  posts\*.md           -> /posts/<slug>/       (blog)
  shop\                -> /shop/               (Snipcart products)
  brand\_index.md      -> /brand/              (raw-HTML brand guide, WP-014)
  tournaments\         -> /tournaments/        (events; featured 3 on home)
  leaderboard\_index.md-> /leaderboard/
  diorama\_index.md    -> /diorama/            (landing page; own signup, WP-024)
```

### Local development {#local-development}

| Task | Command (run from `C:\www\legendary-arena-com\`) |
|---|---|
| **Daily drafting / preview** (includes draft content, reliable rebuilds) | `hugo server -D --disableFastRender` |
| **Production build** (HTML + Pagefind index) | `npm run build` → `hugo --minify && npx pagefind --site public` |
| **Test the built site, incl. Pagefind search** | `npm run build` then `npx serve public` and open the printed `localhost` URL |
| **Test the newsletter CF Function locally** | `npx wrangler pages dev public` (serves on `:8788` — which is why that origin is in `subscribe.js`'s allowlist); supply `BREVO_API_KEY` + `BREVO_LIST_ID` via a `.dev.vars` file |
| **Unit tests** (function logic) | `npm test` → `vitest run` |

Why the distinctions matter:

- **`hugo server` shows neither Pagefind search, OG/Twitter tags,
  Schema, nor the `/api/subscribe` function** — search and SEO tags are
  production-gated or build-time, and the function needs the Pages
  runtime. Don't "test search" or "check social cards" against the dev
  server; you'll see nothing and assume it's broken.
- **`-D`** surfaces `draft: true` content; **`--disableFastRender`**
  forces full rebuilds so partial/template edits reliably show up.
- **Pagefind requires a built site.** `npx serve public` (or any static
  server over `public/`) is how you exercise search before pushing, so
  you don't push blind.

### Designer constraints

- **Changes to partials affect every page.** `header.html` and
  `footer.html` are shared via `partialCached` — a change to either
  propagates site-wide.
- **Do not duplicate header/footer in individual pages.** The base
  template injects them automatically.
- **Do not edit theme files directly.** Project-level overrides in
  `C:\www\legendary-arena-com\layouts\` take precedence. Theme upgrades
  are copy-and-merge against upstream PaperMod.
- **Raw HTML in Markdown is enabled**
  (`markup.goldmark.renderer.unsafe = true`) for the `/brand/` page's
  collapsibles, swatch grids, and icon checklists. Other pages use
  pure Markdown.
- **Pagefind search, OG/Twitter, Schema, and analytics all require a
  production build** — they are absent under `hugo server`.
- **Snipcart, the newsletter form, and conversion menu links are
  commercial surface.** Treat the cart button, the `newsletter-form`
  partial, and the Play/Cards menu items as load-bearing — don't remove
  or restyle them past recognition without checking the owning WP.

### Commit prefix conventions

Edits to marketing repo files use different prefixes depending on
what you're changing. See [Wiki Viewer](wiki-viewer.md) for the full
prefix table.

| Prefix | When |
|---|---|
| `WP-NNN:` | Site-affecting changes (layouts, config, templates, functions) |
| `FIX:` | Content-lane edits — typo, copy tweak, broken link (only `content\**` + `static\images\**`) |
| `POST:` | New blog post |
| `INFRA:` | Tooling, hooks, CI, scripts |

Full details: `C:\www\legendary-arena-com\docs\ai\REFERENCE\01.3-commit-hygiene.md`.

## Interactions

- **Pagefind** — search indexing is scoped by `data-pagefind-body` on
  `<main>` in `baseof.html`. The lazy-load script in `extend_head.html`
  mounts `PagefindUI` into `#la-search` in the header. These two files
  must stay coordinated.
- **PaperMod theme** — overrides shadow upstream templates. Theme
  upgrades require diffing each override against the new upstream
  version, and re-checking that the production-gated block in the
  theme's `head.html` (GA / OG / Twitter / Schema) still loads the
  project partials.
- **Snipcart** (WP-019) — the public key in `hugo.toml`, the CSS in
  `extend_head.html`, and the SDK/mount in `extend_footer.html` must all
  agree on the same Snipcart version (currently `v3.7.1`). The header
  cart button depends on the SDK being present.
- **Brevo** — the `newsletter-form.html` partial feeds
  `functions/api/subscribe.js`, which calls the Brevo Contacts API using
  `BREVO_API_KEY` / `BREVO_LIST_ID` from CF Pages env. See
  [Brevo Email Pipeline](brevo-email-pipeline.md).
- **Brand tokens** — `static/brand-tokens.css` defines `--la-*` CSS
  custom properties consumed by the theme's `custom.css` and the
  partials, and is the only file with a CORS+cache rule in `_headers`
  (it's fetched cross-property). Changing token names breaks downstream
  references.
- **Schema.org / SEO** — `extend_head.html` loads `seo/schema.html` in
  production; `templates/schema_json.html` (project override) suppresses
  PaperMod's home-page Organization emission so the project partial owns
  the full shape. Reads `params.schema` from `hugo.toml`.
- **Google Fonts** — loaded in `extend_head.html` with `display=optional`.
  Font family changes must update both the Google Fonts URL and the
  `--la-font-*` tokens in `static/brand-tokens.css`.

## Edge Cases

- **Trailing slash mismatch** — menu URLs in `hugo.toml` without a
  trailing slash silently break the active-state `<span class="active">`
  highlight. No error is raised.
- **External header links don't open a new tab** — `header.html` (unlike
  `footer.html`) omits `target="_blank"` on external menu items, so
  Play/Cards open in the same tab. Intentional, but a header/footer
  inconsistency to be aware of if you expect new-tab behavior.
- **Honeypot false positive** — if a browser/password-manager ever
  autofills the off-screen `company` field, the signup is silently
  dropped with a fake success. The user sees "subscribed" but Brevo
  never receives them. First suspect if a real signup goes missing.
- **Non-JS form submit fails** — the `/api/subscribe` function only
  accepts `application/json`; a native (JS-disabled) form POST sends
  url-encoded data and is rejected 415. The form's "works without JS"
  comment is aspirational.
- **Font swap CLS** — `display=optional` eliminates swap-induced layout
  shift but means slow-connection users see system fonts for the entire
  session. Intentional (WP-011).
- **Dev vs production divergence** — Pagefind assets, OG/Twitter/Schema
  tags, GA, and the `/api/subscribe` function are all absent or inert
  under `hugo server`. The Pagefind lazy-load script swallows its 404
  silently; the stub `<input>` stays visible but non-functional.
- **`_redirects` doesn't exist** — there is no Pages-level redirect
  layer yet; vanity URLs 404 until `static/_redirects` is created.
- **partialCached scope** — the header is cached by `.Page`; the footer
  by `.Layout`, `.Kind`, `hideFooter`, `ShowCodeCopyButtons`, and
  `hideFooterNewsletter`. A new cache-key dimension requires updating the
  `partialCached` call in `baseof.html`.

## References

- `C:\www\legendary-arena-com\hugo.toml` — site config, menus, markup, Snipcart key, schema
- `C:\www\legendary-arena-com\layouts\baseof.html` — page skeleton with `data-pagefind-body`
- `C:\www\legendary-arena-com\layouts\_partials\header.html` — nav + cart button + search stub
- `C:\www\legendary-arena-com\layouts\_partials\footer.html` — footer nav + newsletter + scripts
- `C:\www\legendary-arena-com\layouts\_partials\extend_head.html` — fonts, tokens, Pagefind, Schema, Snipcart CSS
- `C:\www\legendary-arena-com\layouts\_partials\extend_footer.html` — newsletter JS, Snipcart SDK/mount
- `C:\www\legendary-arena-com\layouts\_partials\newsletter-form.html` — reusable email-capture partial (with honeypot)
- `C:\www\legendary-arena-com\functions\api\subscribe.js` — Brevo subscribe CF Pages Function (honeypot + validation)
- `C:\www\legendary-arena-com\assets\js\newsletter.js` — progressive-enhancement submit
- `C:\www\legendary-arena-com\static\_headers` — Cloudflare edge headers (brand-tokens CORS+cache)
- `C:\www\legendary-arena-com\static\` — favicon set (ico / 16 / 32 / apple-touch / safari-pinned-tab)
- `C:\www\legendary-arena-com\themes\PaperMod\layouts\_partials\head.html` — favicons, OG, Twitter, GA, schema (prod-gated)
- `C:\www\legendary-arena-com\layouts\index.html` — home override (hero CTA, tournaments, featured gear)
- `C:\www\legendary-arena-com\static\brand-tokens.css` — cross-site brand token contract
- `C:\www\legendary-arena-com\docs\ai\REFERENCE\01.3-commit-hygiene.md` — commit prefix conventions
- `C:\www\legendary-arena-com\docs\03-ROADMAP.md` — analytics platform deferral, WP-021
- [Hugo — `youtube` shortcode](https://gohugo.io/shortcodes/youtube/) — built-in shortcode reference (params: `id`, `title`, `start`, `autoplay`, `loading`, `class`)
- [Hugo — Configure privacy](https://gohugo.io/configuration/privacy/) — `[privacy.youtube] privacyEnhanced` (no-cookie embeds)
- WP-004 — home page override
- WP-005 — Pagefind search integration, `#la-search` id lock
- WP-008 — Schema.org / SEO baseline
- WP-010 — footer nav
- WP-011 — `display=optional` CLS fix
- WP-014 — `/brand/` page, `unsafe = true` for raw HTML in Markdown
- WP-015 — newsletter signup form + `/api/subscribe`
- WP-019 — Snipcart commerce
- WP-021 — funnel analytics baseline (platform selection deferred)
- WP-024 — `hideFooterNewsletter` per-page suppression
