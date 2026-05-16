# EC-166 — Wiki Blockquote Styling (Execution Checklist)

**Source:** Inline request — add background color and border to blockquotes in the ewiki viewer.
**Layer:** Wiki Viewer (`apps/wiki-viewer/assets/css/`)

## Scope

Add a CSS rule to `apps/wiki-viewer/assets/css/style.css` that styles
all `<blockquote>` elements with:

- Light background (`#f8fafc`)
- 1px solid border using `var(--color-border)`
- 4px solid left accent border using `var(--color-accent)`
- 4px border-radius
- Appropriate padding and margin

This applies site-wide to all blockquotes, including the editing
procedure boxes on marketing pages.

## Checklist

- [x] Add blockquote CSS rule to `style.css`
- [ ] Verify rendering on ewiki after deploy
