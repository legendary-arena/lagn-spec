# Legendary Arena Engineering Wiki Viewer

> why: This app is a build-time, read-only projection of the engineering wiki
> at [`docs/wiki/`](../../docs/wiki/). Hugo Extended is the static-site
> generator (D-13808 — Docusaurus rejected for MDX risk; custom rejected for
> build cost vs zero feature lift). The publish/sync contract — `docs/wiki/`
> is the only authoring surface; the rendered site is regenerated on every
> build and never hand-edited — is locked by [SCHEMA.md § Publish / Sync
> Boundary](../../docs/wiki/SCHEMA.md). Any drift between source and rendered
> output is resolved by re-projecting from `docs/wiki/`, never by editing
> `apps/wiki-viewer/content/wiki/` or `apps/wiki-viewer/public/`.

## Overview

The build pipeline projects `docs/wiki/*.md` into Hugo's content tree, runs a
case-sensitive link-integrity check on the projected markdown, then invokes
`hugo` to render 13 content routes (10 entity pages + 1 section landing +
`SCHEMA.md` + `README.md`). The site is JS-free at v1 — no client-side search,
no interactivity. External `../**` links in the wiki source are rewritten to
GitHub blob URLs by the markdown render hook (D-13809). Reserved-file handling
uses build-time content projection (D-13810): `INDEX.md` is renamed to
`_index.md` only on the projected copy; the source under `docs/wiki/` is
never modified.

Layer-boundary posture: this app does not import
`@legendary-arena/game-engine`, `@legendary-arena/registry`,
`@legendary-arena/preplan`, or `apps/server/**` at any seam (build, dev, or
prod). Code-category classification is `docs-app` per
[D-13807](../../docs/ai/DECISIONS.md).

## Build

```bash
pnpm wiki-viewer:build
```

Runs in order: content projection → link-integrity check → Hugo build. Output
lands in `apps/wiki-viewer/public/`. Two consecutive builds produce
byte-identical output across `*.html` + `*.css`; `enableGitInfo = false` in
`hugo.toml` keeps the determinism lock intact.

## Dev

```bash
pnpm wiki-viewer:dev
```

Runs the projection step then `hugo server --port 1313`. Live-reload is
enabled in dev mode (and only in dev mode); production builds (`hugo` with no
`server` flag) do not emit `<script>` tags.

## Link integrity

```bash
pnpm wiki-viewer:check-links
```

Operates on the projected markdown tree (`apps/wiki-viewer/content/wiki/`),
not on rendered HTML. Internal markdown links must resolve case-sensitively
(Windows is case-insensitive but CI on Linux is not — the check enforces the
strict rule so local and CI agree). External URLs and `../**` out-of-tree
links are out of scope (rewritten by the render hook at build time;
availability is not the wiki's responsibility).

## Deploy

The site deploys as a Render static-site service named `legendary-arena-wiki`
declared in [`render.yaml`](../../render.yaml) (D-13811). CI is
[`.github/workflows/wiki-viewer.yml`](../../.github/workflows/wiki-viewer.yml),
triggered on push to `main` touching `docs/wiki/` or `apps/wiki-viewer/`.

## Hugo version

Pinned to **0.135.0 Extended** in
[`.hugo-version`](.hugo-version) (Open Decision C, locked). The CI workflow
reads this file and installs the matching binary; do not let it drift without
a DECISIONS entry.

## Theme

Hand-rolled minimal theme inside this app (Open Decision B, locked). No
third-party theme dependency. A future WP that wants Docsy / Hextra / etc.
must add a DECISIONS entry that supersedes the lock.

## Files

- `hugo.toml` — site config + determinism knobs.
- `layouts/_default/baseof.html` + `single.html` + `list.html` — page chrome,
  entity rendering, section landing.
- `layouts/_default/_markup/render-link.html` — markdown render hook
  (internal `.md` resolution + GitHub-blob rewrite per D-13809).
- `layouts/partials/{metadata-panel,related,source-citations}.html` — the
  three content partials.
- `assets/css/style.css` — minimal hand-rolled theme styling.
- `scripts/project-wiki.mjs` — build-time content projection (read-only on
  `docs/wiki/`; copy + rename-only-on-the-copy per D-13810).
- `scripts/check-links.mjs` — case-sensitive link-integrity check.
- `.hugo-version` — Hugo version pin (`0.135.0`).
