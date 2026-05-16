---
title: Ewiki Authoring
type: Guide
tags:
  - hugo
  - documentation
  - governance
  - designer-reference
related:
  - wiki-viewer.md
  - hugo-web-system.md
status: draft
source:
  - ../apps/wiki-viewer/assets/css/style.css
  - ../apps/wiki-viewer/hugo.toml
last-reviewed: 2026-05-16
---

# Ewiki Authoring

## Summary

A style and formatting reference for writing content on
`ewiki.legendary-arena.com`. Covers the markdown patterns and CSS
styles available in the wiki viewer theme, including blockquotes,
tables, code blocks, inline code, and the metadata panel. The
[Wiki Viewer](wiki-viewer.md) page covers page creation, commit
prefixes, build pipeline, and publishing; this page covers what
formatting tools are available once you're writing content.

## Mechanics

### Available Styles

The wiki viewer theme (`apps/wiki-viewer/assets/css/style.css`)
provides the following visual elements. Raw HTML is disabled
(`unsafe = false` in Hugo config), so all styling must be achieved
through standard markdown.

#### Blockquotes

Blockquotes render with a light background, thin border, and blue
left accent stripe. Use them for callout boxes, editing procedures,
and important notices.

**Markdown:**

```
> **Editing this page**
>
> This ewiki page mirrors the homepage strategy reference.
> The source lives at `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`.
>
> - **To edit the source document:** edit the file in the marketing repo,
>   commit with `SPEC:` prefix, push to `main`.
> - **Keep both in sync.** If the source document changes, update this
>   ewiki page too.
```

**Rendered style:**

- Background: `#f8fafc` (light gray-blue)
- Border: 1px solid `#e5e7eb` (theme border color)
- Left accent: 4px solid `#1d4ed8` (theme blue)
- Border radius: 4px
- Padding: 0.75rem 1rem

Blockquotes can contain bold text, lists, inline code, and links.
Nested blockquotes are not styled differently — avoid nesting.

#### Tables

Tables render with collapsed borders and a light header row.

**Markdown:**

```
| Column A | Column B | Column C |
|----------|----------|----------|
| row 1    | data     | data     |
| row 2    | data     | data     |
```

**Rendered style:**

- Header row background: `#f9fafb`
- Cell border: 1px solid `#e5e7eb`
- Cell padding: 0.4rem 0.7rem
- Alignment: `:---` left, `:---:` center, `---:` right

Tables must be inside the `.body` container (all wiki page content
is) to receive styling.

#### Code Blocks

Fenced code blocks render as monospace text on a gray background.
Syntax highlighting is disabled for deterministic builds.

**Markdown:**

````
```
const x = 42;
```
````

**Rendered style:**

- Background: `#f3f4f6`
- Font: SFMono-Regular, Menlo, Monaco, Consolas (monospace stack)
- Font size: 0.92em
- Padding: 0.75rem 1rem
- Border radius: 4px
- Horizontal scroll on overflow

#### Inline Code

Inline code renders with a subtle background to distinguish it from
surrounding text.

**Markdown:**

```
Use the `SPEC:` prefix for governance docs.
```

**Rendered style:**

- Background: `#f3f4f6`
- Padding: 0.1rem 0.3rem
- Border radius: 3px
- Font size: 0.92em

#### Links

Links use the theme accent color with no underline by default.
Underline appears on hover.

**Rendered style:**

- Color: `#1d4ed8` (blue)
- Text decoration: none (underline on hover)

#### Emoji

Unicode emoji (✅, ❌, ⚠️) render natively in all browsers and can
be used in tables, lists, and body text for visual scanning. No
special syntax needed — paste the emoji directly.

```
| Dimension | Physical | Digital |
|-----------|----------|---------|
| Rules     | ❌ Manual | ✅ Automatic |
```

### Theme CSS Variables

The theme defines these CSS custom properties on `:root`. All
styled elements use these variables, so they change consistently
if the palette is updated.

| Variable | Value | Used For |
|----------|-------|----------|
| `--color-bg` | `#ffffff` | Page background |
| `--color-fg` | `#1f2933` | Body text |
| `--color-muted` | `#6b7280` | Secondary text, labels |
| `--color-accent` | `#1d4ed8` | Links, blockquote accent |
| `--color-border` | `#e5e7eb` | Table borders, dividers, blockquote border |
| `--color-status-canonical` | `#047857` | Green status badge |
| `--color-status-draft` | `#a16207` | Amber status badge |
| `--color-status-deprecated` | `#b91c1c` | Red status badge |

### What You Cannot Use

The wiki viewer intentionally restricts certain features:

- **No raw HTML.** Hugo's Goldmark renderer has `unsafe = false`.
  You cannot embed `<div>`, `<span>`, `<style>`, or any HTML tags.
- **No syntax highlighting.** Fenced code blocks render as plain
  monospace. Language hints (` ```js `) are accepted but ignored.
- **No shortcodes.** The wiki viewer has no Hugo shortcodes defined.
- **No JavaScript.** Production builds emit zero `<script>` tags.
- **No custom CSS classes in markdown.** Standard markdown has no
  mechanism to apply CSS classes to elements. All styling comes from
  element-level CSS rules in the theme.

### Two-Repo Editing Procedures

Some ewiki pages mirror source documents that live in a different
repo. When this is the case, add an editing procedure blockquote at
the top of the page (after the `# Title` heading) explaining:

1. Where the source document lives (full path)
2. How to edit the source document (commit prefix, push target)
3. How to edit the ewiki page (commit prefix, push target)
4. The sync requirement

**Template:**

```
> **Editing this page**
>
> This ewiki page mirrors [description]. The source
> lives at `[full path]`
> (in the `[repo name]` repo, not this repo).
>
> - **To edit the source document:** edit the file in the [repo] repo,
>   commit with `SPEC:` prefix, push to `main`.
> - **To edit this ewiki page:** edit
>   `[full ewiki path]`,
>   commit with `SPEC:` prefix, push to `main` in the `legendary-arena` repo.
> - **Keep both in sync.** If the source document changes, update this
>   ewiki page too.
```

Pages that use this pattern:
- [Homepage Spec](homepage-spec.md)
- [Homepage Appendix](homepage-appendix.md)
- [Homepage Review Template](homepage-review-template.md)

### Metadata Panel (Automatic)

The front-matter fields (`type`, `status`, `tags`, `related`,
`source`, `last-reviewed`) are rendered automatically by the Hugo
layout as a metadata panel at the top of every page. You do not
write this panel in markdown — it's generated from the YAML
front-matter.

**Rendered style:**

- 2-column grid (label + value)
- Border: 1px solid `#e5e7eb`, radius 6px
- Tags render as pill badges (indigo on light blue: `#3730a3` on
  `#eef2ff`)
- Status renders as a colored badge (green/amber/red)

## Interactions

- **[Wiki Viewer](wiki-viewer.md)** — covers page creation, commit
  prefixes, build pipeline, markdown syntax for links/images/tables,
  and publishing. This page extends that with style-specific guidance.
- **[Hugo Web System](hugo-web-system.md)** — the marketing site at
  `www.legendary-arena.com` is a separate Hugo site with its own
  theme (PaperMod). Styles documented here apply only to the ewiki.
- **SCHEMA.md** — defines the required sections, front-matter
  fields, and entity types. This page documents how to *format*
  content within those sections.

## Edge Cases

- **Blockquote nesting.** Nested blockquotes (`> > text`) are not
  styled differently from top-level blockquotes. Avoid nesting —
  use lists inside a single blockquote instead.
- **Table width.** Tables expand to fit content but do not scroll
  horizontally. Very wide tables (many columns or long cell text)
  may cause layout issues on narrow screens.
- **Emoji rendering.** Unicode emoji render using the browser's
  native emoji font. Appearance varies slightly across platforms
  (Windows, macOS, Linux) but is functionally equivalent.
- **No dark mode.** The theme has no dark mode variant. All colors
  are hardcoded light-mode values.

## References

- `C:\pcloud\BB\DEV\legendary-arena\apps\wiki-viewer\assets\css\style.css`
  — theme stylesheet (authoritative for all style values)
- `C:\pcloud\BB\DEV\legendary-arena\apps\wiki-viewer\hugo.toml`
  — Hugo config (confirms `unsafe = false`, syntax highlighting off)
- [Wiki Viewer](wiki-viewer.md) — page creation and publishing
- [SCHEMA.md](SCHEMA.md) — entity-page contract
