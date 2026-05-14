---
title: Wiki Viewer
type: System
tags:
  - hugo
  - governance
  - documentation
related:
  - architecture-inventory.md
  - hugo-web-system.md
status: draft
source:
  - ../apps/wiki-viewer/hugo.toml
  - ../apps/wiki-viewer/scripts/project-wiki.mjs
  - ../apps/wiki-viewer/README.md
last-reviewed: 2026-05-13
---

## Summary

The wiki viewer is the Hugo static site that renders `wiki/*.md` pages
into the browsable site at `ewiki.legendary-arena.com`. Content is
authored exclusively in `wiki/`, projected into the Hugo content tree at
build time, and deployed automatically on every push to `main`.

## Mechanics

### How to create a new wiki page

**1. Pick a filename.** Kebab-case the title: lowercase, spaces become
hyphens, drop characters outside `[a-z0-9-]`. Example: `Board Keywords`
becomes `board-keywords.md`.

**2. Create the file at `wiki/<slug>.md`** with YAML front-matter:

```yaml
---
title: Board Keywords
type: Concept
tags:
  - layer-engine
  - keyword-board
related:
  - villain-deck.md
  - turn-system.md
status: draft
source: []
last-reviewed: 2026-05-13
---
```

Front-matter fields:

| Field           | Required    | Values / Notes                                     |
|-----------------|-------------|----------------------------------------------------|
| `title`         | yes         | Human-readable. Match the glossary entry if one exists. |
| `type`          | yes         | `Mechanic` \| `System` \| `Card-Type` \| `Keyword` \| `Concept` |
| `tags`          | yes         | Lowercase-hyphenated list. `[]` is allowed.        |
| `related`       | yes         | Other wiki `.md` filenames this entity touches.    |
| `status`        | yes         | `canonical` \| `draft` \| `deprecated`             |
| `source`        | conditional | Non-empty for `canonical`. `[]` ok for `draft`.    |
| `last-reviewed` | yes         | ISO date `YYYY-MM-DD`.                             |

**3. Write the required sections** in this exact order:

```markdown
## Summary

One to three sentences. What the entity is and why it matters.

## Mechanics

How it works. Technical, concrete, citable.

## Interactions

Which other entities this one touches. Link to other wiki pages:

- [Scoring](scoring.md) — uses the par baseline for X.
- [Turn System](turn-system.md) — triggers during cleanup stage.

## Edge Cases

Corner conditions, drift hazards, known gotchas.
If none are known, write "None known at this revision."

## References

Bullet list of cited artifacts:

- [ARCHITECTURE.md](../docs/ai/ARCHITECTURE.md)
- [WP-020](../docs/ai/work-packets/WP-020-vp-scoring-win-summary-minimal-mvp.md)
```

Optional sections may appear after Edge Cases and before References:
`Code Touchpoints`, `Data Files`, `History`, `Open Questions`.

**4. Link to other pages using relative markdown paths:**

```markdown
Within the wiki:    [Master Strike](master-strike.md)
To repo artifacts:  [ARCHITECTURE.md](../docs/ai/ARCHITECTURE.md)
```

Do not use Obsidian wiki-links (`[[Page]]`), bare URLs in body text,
or absolute paths (`C:\...`).

### Where to save files

**Images** go in `static/images/` within the site repo
(`C:\www\legendary-arena-com\static\images\`). Never save images to
`C:\www\legendary-arena-com\public\images\` — the `public/` directory
is Hugo's build output and is regenerated from scratch on every build.
Anything saved there will be silently deleted on the next `hugo` run.

**Research files and notes** go in `C:\pcloud\LA\ewiki\`. This is the
working directory for drafts, reference material, and scratch notes
that support wiki content but are not published to the site.

### How to preview locally

Run the Hugo dev server from the repo root:

```
pnpm wiki-viewer:dev
```

This projects `wiki/*.md` into the Hugo content tree then starts the
server at `http://localhost:1313` with live-reload. Changes to wiki
source files reload automatically.

If the command errors, check that your local Hugo Extended version
matches `apps/wiki-viewer/.hugo-version` (currently 0.135.0).

### How to publish

```
git add wiki/<slug>.md
git commit -m "EC-142: wiki <slug> — <one-line summary>"
git push origin main
```

Render auto-deploys the static site within 1-2 minutes. The page
appears at `https://ewiki.legendary-arena.com/<slug>/`.

### How to edit an existing page

Open the page in `wiki/<slug>.md`, make your changes, then:

```
git add wiki/<slug>.md
git commit -m "EC-142: wiki <slug> — <one-line summary of change>"
git push origin main
```

If you edited multiple pages in one pass:

```
git add wiki/scoring.md wiki/turn-system.md
git commit -m "EC-142: wiki scoring, turn-system — update interactions after WP-048"
git push origin main
```

Update `last-reviewed` in the front-matter whenever you verify the
page against current code or docs (not needed for typo fixes).

If the edit changes a page's `type`, `status`, or filename, also
regenerate `INDEX.md` in the same commit.

### Build pipeline (what runs on push)

1. **Projection** (`pnpm wiki-viewer:project`) — copies every
   `wiki/*.md` file into `apps/wiki-viewer/content/`. Renames the
   copy of `INDEX.md` to `_index.md` (Hugo home page convention).
   The source file under `wiki/` is never modified.
2. **Link check** (`pnpm wiki-viewer:check-links`) — case-sensitive
   validation of every internal `<page>.md` link. A broken link fails
   the build.
3. **Hugo render** (`hugo --source apps/wiki-viewer --minify`) —
   generates `apps/wiki-viewer/public/`. External `../path` links are
   rewritten to GitHub blob URLs by the markdown render hook.

### Status promotion

Pages start as `draft`. Promote to `canonical` when:

- Every factual claim in the body has a source citation.
- `Open Questions` section is empty or removed.
- `last-reviewed` reflects current verification date.

### Theme and layout

The wiki viewer uses a hand-rolled theme (no third-party framework).
Key layout features:

- **Sidebar nav** — pages grouped by `type`, sorted alphabetically.
- **Metadata panel** — renders `type`, `status` (color-coded badge),
  `tags` (pill badges), and `last-reviewed`.
- **Related pages** and **source citations** render as panels below
  the main content.
- **Link rewriting** — a markdown render hook converts `slug.md` links
  to `/<slug>/` and `../path` links to GitHub blob URLs.

The theme is defined in `apps/wiki-viewer/layouts/` and
`apps/wiki-viewer/assets/css/style.css`.

## Interactions

- [Hugo Web System](hugo-web-system.md) — the marketing site at
  `www.legendary-arena.com` is a separate Hugo site with its own theme
  (PaperMod). The wiki viewer is independent.
- [architecture-inventory.md](architecture-inventory.md) — generated
  page exempt from front-matter schema. Sole writer is
  `scripts/architecture-inventory.mjs`.
- **SCHEMA.md** — the entity-page contract. Defines the closed sets
  for `type` and `status`, required sections, file naming, and the
  50-page flat-structure cap.
- **INDEX.md** — categorized list of all wiki pages. Must be
  regenerated when a page is added, renamed, or has its type/status
  changed.
- **Render deployment** — `render.yaml` declares the
  `legendary-arena-wiki` static site service. CI runs the same
  pipeline on PRs and `main` pushes.

## Edge Cases

- **Windows case-sensitivity.** Windows is case-insensitive but CI
  runs on Linux. A link to `Scoring.md` works locally but breaks in
  CI. Always use lowercase filenames and link targets.
- **INDEX.md rename.** The projection script renames `INDEX.md` to
  `_index.md` only in the copy under `apps/wiki-viewer/content/`.
  Never rename the source file in `wiki/`.
- **Flat-structure cap.** The wiki supports up to 50 entity pages.
  Beyond 50 requires a SCHEMA amendment before adding more pages.
- **No subdirectories.** All entity pages are flat in `wiki/`.
  Categorization is by front-matter `type`, surfaced in INDEX.md.
- **Syntax highlighting disabled.** Fenced code blocks render as
  plain `<pre><code>` to maintain byte-identical deterministic builds.
- **No raw HTML.** Goldmark's `unsafe` is set to `false` in the wiki
  viewer config.

## References

- [SCHEMA.md](SCHEMA.md) — the entity-page contract
- [README.md](README.md) — purpose, conventions, authority
- [apps/wiki-viewer/hugo.toml](../apps/wiki-viewer/hugo.toml) — Hugo config
- [apps/wiki-viewer/scripts/project-wiki.mjs](../apps/wiki-viewer/scripts/project-wiki.mjs) — content projection script
- [apps/wiki-viewer/scripts/check-links.mjs](../apps/wiki-viewer/scripts/check-links.mjs) — link integrity check
- [apps/wiki-viewer/layouts/](../apps/wiki-viewer/layouts/) — theme layouts
- [apps/wiki-viewer/assets/css/style.css](../apps/wiki-viewer/assets/css/style.css) — theme stylesheet
