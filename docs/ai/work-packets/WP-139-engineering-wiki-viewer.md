# WP-139 — Engineering Wiki Viewer (Hugo, Build-Time Projection)

**Status:** Draft (drafted 2026-05-08; not yet executed; lint gate not yet
invoked — execution requires `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`
pass; not yet added to `WORK_INDEX.md`).
**Primary Layer:** New app under `apps/wiki-viewer/` (consumed only at
build time; no runtime imports from `game-engine`, `registry`,
`preplan`, or `server`).
**Dependencies:**
1. Engineering wiki must be on `main` first (the 10 entity pages +
   `SCHEMA.md` + `INDEX.md` + `README.md` introduced under the four
   `SPEC: wiki ...` commits at the head of branch
   `claude/festive-moore-eba215` — not yet merged at draft time).
   The viewer renders that source; without it on `main`, this WP is
   BLOCKED.
2. **D-13807 (`docs-app` code category) — LANDED 2026-05-08** in the
   same governance pass that drafted WP-139. Defines a new `docs-app`
   category in `docs/ai/REFERENCE/02-CODE-CATEGORIES.md` covering both
   `apps/registry-viewer/` (existing precedent gap closed) and
   `apps/wiki-viewer/` (introduced by this WP). Files created by
   WP-139 fall under this category by construction.

**Supersedes:** none. Establishes the first rendered projection of the
engineering wiki.

**Related Execution Checklist:** [`docs/ai/execution-checklists/EC-142-engineering-wiki-viewer.checklist.md`](../execution-checklists/EC-142-engineering-wiki-viewer.checklist.md). EC-142 is the authoritative execution contract; if EC and WP conflict, the WP wins per `.claude/CLAUDE.md`.

---

## Session Context

The engineering wiki at [`docs/wiki/`](../../wiki/) is markdown-only
at v1: 10 entity pages plus three reserved files (`SCHEMA.md`,
`INDEX.md`, `README.md`). Authoring is fully usable today via any
markdown viewer (VS Code preview, GitHub blob view, plain
`less`). [SCHEMA.md § Publish / Sync Boundary](../../wiki/SCHEMA.md)
explicitly defers the rendered viewer to a future effort and locks
the contract: `docs/wiki/` is the only authoring location; any
rendered output is a **read-only projection**.

This Work Packet implements that projection. It introduces a
build-time static-site generator (Hugo) that reads `docs/wiki/` as
its content source, applies templates that surface the wiki's
custom front-matter (`type`, `tags`, `related`, `status`,
`source`, `last-reviewed`), and emits a static HTML site
deployable to any static host. The viewer is **strictly**:

- Build-time only — no runtime backend, no server-side rendering.
- A projection — the rendered HTML is regenerated from
  `docs/wiki/` on every build; the publish target is never hand-
  edited.
- Layer-boundary clean — must not runtime-import `game-engine`,
  `registry`, `preplan`, `server`, or any internal package.

The framework comparison rationale (Hugo vs Docusaurus vs custom)
is locked by D-13808 below.

---

## Goal

After this packet:

1. A new app exists at `apps/wiki-viewer/` (or alternative agreed
   location — see **Open Decisions** below). It contains a Hugo
   site configuration, layout templates, and a content-source
   wiring that points at `docs/wiki/`.
2. Running `pnpm --filter wiki-viewer build` (or the equivalent
   non-pnpm Hugo command — see **Open Decisions**) produces a
   static HTML site under `apps/wiki-viewer/public/` (or
   equivalent build-output directory).
3. The rendered site exposes:
   - One landing page per entity page (10 pages from v1).
   - A categorized index landing page derived from
     [`INDEX.md`](../../wiki/INDEX.md).
   - Sidebar navigation by entity `type` (Mechanic / System /
     Concept / Card-Type / Keyword).
   - Per-page metadata panel showing `type`, `status`, `tags`,
     `last-reviewed`.
   - A rendered `related` panel listing sibling pages with
     working links.
   - A rendered `source` citation list with working links to
     repo artifacts (resolution strategy locked by **Open
     Decision E**).
4. The schema's reserved files (`SCHEMA.md`, `README.md`) render
   as accessible-but-unindexed pages (visible by URL but not in
   the entity-page sidebar). `INDEX.md` becomes the section
   landing page.
5. Build output is deterministic: same input + same templates →
   byte-identical HTML.
6. Build-time link integrity check passes: every internal wiki
   link (`[Title](slug.md)`) resolves to a generated page; broken
   internal links fail the build (this is the lint mechanization
   referenced in [SCHEMA.md § Lint Targets](../../wiki/SCHEMA.md)).
7. A deployment artifact exists per the **Open Decision F**
   choice (Render static site / Cloudflare Pages / GitHub Pages /
   etc.). Build-trigger wiring is in place per **Open Decision G**.

The wiki's source contract is unchanged: `docs/wiki/` files are
not modified by this WP. The viewer reads; it does not author.

---

## Assumes

- The engineering wiki is on `main`. The 10 entity pages plus
  `SCHEMA.md` / `INDEX.md` / `README.md` from the four `SPEC: wiki ...`
  commits on `claude/festive-moore-eba215` have merged. Until that
  merge lands, this packet is **BLOCKED**.
- `docs/wiki/SCHEMA.md` is the locked schema contract; this WP does
  not modify it. If a schema amendment is required to make Hugo
  rendering work cleanly (e.g., `INDEX.md` → `_index.md` rename),
  the schema amendment is its own DECISIONS.md entry and either
  precedes or accompanies this WP.
- `pnpm --filter @legendary-arena/registry test` and
  `pnpm --filter @legendary-arena/game-engine test` exit 0 at start.
- A working Hugo binary is available on the development host. Hugo
  Extended ≥ 0.120 (concrete version pin set during execution).
- The current `apps/` workspace pattern in `pnpm-workspace.yaml`
  tolerates a non-pnpm app entry under `apps/wiki-viewer/`, OR
  the WP relocates the viewer outside `apps/` per **Open
  Decision A**.
- `docs/ai/DECISIONS.md` exists and `D-13808..D-13811` (or the
  next-free contiguous block at execution time) is available
  for the four execution-time decisions defined in § Decisions.

If any of the above is false this packet is **BLOCKED**.

---

## Context (Read First)

Mandatory reading before execution:

- [`docs/wiki/SCHEMA.md`](../../wiki/SCHEMA.md) — the contract this
  viewer projects, especially:
  - § Front-Matter Format (the YAML field surface)
  - § Required Sections (fixed-order body sections)
  - § Cross-Reference Conventions (link integrity rules)
  - § Source Field Conventions (what counts as a citation)
  - § Publish / Sync Boundary (the projection rule this WP implements)
  - § Lint Targets (the build-time checks this WP mechanizes)
- [`docs/wiki/README.md`](../../wiki/README.md) — wiki orientation,
  authority position, contribution conventions.
- [`docs/wiki/INDEX.md`](../../wiki/INDEX.md) — the categorized
  entry point (will become the rendered site's landing page).
- [`docs/ai/ARCHITECTURE.md`](../ARCHITECTURE.md) — Layer Boundary
  (the new app must respect the layer-boundary rules; viewer is in
  the same dependency-direction class as `apps/registry-viewer/`).
- [`.claude/rules/architecture.md`](../../../.claude/rules/architecture.md)
  — Layer overview and import rules. Particularly: "viewer must
  not import game-engine / registry at runtime."
- [`.claude/rules/work-packets.md`](../../../.claude/rules/work-packets.md)
  — One Work Packet per session; dependency discipline; status
  update rules.
- [`docs/01-VISION.md`](../../01-VISION.md) §15 (Built for
  Contributors) — the wiki and its viewer exist to support
  contributor onboarding without tribal knowledge.

---

## Non-Negotiable Constraints

These are hard rules. Violations are blockers; refactor instead.

### Layer-boundary

- The viewer must not runtime-import `@legendary-arena/game-engine`,
  `@legendary-arena/registry`, `@legendary-arena/preplan`, or
  `apps/server/**` at any point in its build or runtime.
- Build-time reads of `docs/wiki/` markdown files are permitted.
  Build-time reads of artifacts outside `docs/wiki/` (e.g.,
  `docs/ai/ARCHITECTURE.md`) are permitted **only** if **Open
  Decision E** selects the "additional content mount" strategy;
  otherwise out-of-tree links route to GitHub blob URLs at build
  time.
- The viewer must not query PostgreSQL, R2, or any network resource
  at build or runtime.
- The viewer must not modify `docs/wiki/` content during build.
  The schema's projection contract requires read-only source.

### Source content discipline

- Wiki Markdown files remain pure Markdown + YAML front-matter.
  **MDX is forbidden.** This is the practical reason Docusaurus
  was rejected (D-13808); reintroducing MDX would silently
  reopen the rejected path.
- The viewer's templates may render front-matter custom fields
  (`type`, `status`, `tags`, `related`, `source`, `last-reviewed`)
  but must not embed React components, scripts, or any dynamic
  client-side logic in the rendered Markdown body.
- Build-time link integrity is mandatory. A broken internal wiki
  link fails the build with a non-zero exit code; broken external
  links may warn but must not fail (external availability is not
  the wiki's responsibility).

### Determinism

- Two consecutive builds against the same `docs/wiki/` tree and
  the same template tree must produce byte-identical output
  across the **controlled file set**:
  `apps/wiki-viewer/public/**/*.html` +
  `apps/wiki-viewer/public/**/*.css`.
  (Files outside this set — e.g., a sitemap if it leaks in —
  are not asserted against, but the hash check below in §
  Verification Steps is the binding lock.)
- No dates, randomness, or network state in template rendering.
  No `now` / `time.Now` / `os.Getenv` template calls.
- `hugo.toml` must explicitly disable known nondeterminism
  sources:
  - `enableGitInfo = false` (no git-derived `lastmod` /
    `gitInfo` fields embedded in HTML)
  - RSS feeds, sitemap, and taxonomy outputs disabled unless
    explicitly required at v1 (each adds output paths and
    several embed timestamps; v1 has no need for them)
- Hugo's default Markdown rendering meets the byte-identical
  bar when the above are honored; any custom template logic
  introduced by this WP must too.

### Schema

- This WP must not modify [`docs/wiki/SCHEMA.md`](../../wiki/SCHEMA.md).
  If a schema amendment surfaces during execution as truly
  necessary, stop and either route the amendment through a
  separate DECISIONS entry first or replan this WP to fit the
  current schema.

---

## Open Decisions (the WP author locks each before execution)

These are explicit decisions surfaced by the framework analysis
and the schema's projection contract. Each is **unbound** at
draft time and must be locked in either this WP's body or in a
dedicated DECISIONS entry before execution starts.

### A — Project location

Default proposal: `apps/wiki-viewer/`. Matches the project
convention (`apps/registry-viewer/`, `apps/arena-client/`,
`apps/server/`). Hugo sites do not require `package.json`; pnpm
workspace resolution skips non-Node directories.

Alternatives:
- `site/` (top-level; distinct from `apps/`)
- `docs/wiki-site/` (colocate with the wiki source)

### B — Hugo theme — **LOCKED**

**Locked:** minimal hand-rolled theme inside the viewer app. No
third-party theme dependency. (Promoted from "default proposal" to
"locked" per copilot check finding #12: theme choice determines the
dependency surface and a mid-session pivot to Docsy / Hextra would
silently expand layer-boundary risk.)

Rejected alternatives (recorded for traceability):
- Docsy — richer feature set, but pulls in postcss / asciidoctor
  (heavier dep surface; lifecycle / compatibility risk).
- Hextra — lighter, Tailwind-based, but introduces Tailwind tooling
  with no current monorepo precedent.

If a future WP wants a third-party theme, it is its own DECISIONS
entry that supersedes this lock.

### C — Hugo version pin — **LOCKED**

**Locked:** Hugo Extended `0.135.0`. Pinned in
`apps/wiki-viewer/.hugo-version` for CI reproducibility. (Promoted
from "0.130.0 or latest stable at execution time" to a concrete pin
per copilot check finding #12: version pin determines reproducibility
and "latest stable" is non-deterministic.)

If the executing agent finds 0.135.0 unavailable on the development
host, record the actual installed version in pre-flight notes and
either install 0.135.0 or amend this lock with a new DECISIONS entry
explaining the version choice.

### D — Reserved-file handling

Default proposal: **build-time content projection** (no schema
change). The build pipeline copies `docs/wiki/*.md` into a
projected content tree under the viewer at
`apps/wiki-viewer/content/wiki/`, then renames *only the copy*
`INDEX.md → _index.md` to satisfy Hugo's section-landing
convention. The source under `docs/wiki/` is never modified.
SCHEMA.md and README.md are projected as regular pages,
excluded from sidebar generation (no entity `type` front-matter),
but reachable by direct URL.

The projection is implemented by a small build-time script
(`apps/wiki-viewer/scripts/project-wiki.mjs`) invoked before
`hugo` runs. The script's contract: read-only on `docs/wiki/`;
idempotent on the projection target; case-sensitive filename
handling.

Alternatives:
- Configure Hugo to recognize uppercase `INDEX.md` as a section
  landing (less idiomatic; depends on Hugo internals).
- Amend the wiki schema's "ALL-CAPS reserved filenames" rule to
  permit `_index.md` (would require a SCHEMA.md amendment +
  DECISIONS entry; not preferred).

### E — External-link strategy

The wiki's `source` field and many in-body citations link to
artifacts outside `docs/wiki/` (e.g., `../ai/ARCHITECTURE.md`,
`../../packages/...`). Three options:

- **(E1) GitHub blob rewrite** *(default proposal).* At build
  time, links to `../**` are rewritten to
  `https://github.com/barefootbetters/legendary-arena/blob/main/<path>`.
  Pros: clean UX; ties to the canonical repo. Cons: depends on
  the repo URL being stable and the path resolving on `main`.
- **(E2) Additional content mount.** Hugo `module mounts`
  configuration pulls additional directories (`docs/ai/`,
  `packages/`, `.claude/`) into the build's content tree.
  Pros: links work in-site without leaving. Cons: bloats build
  output; risks blurring the "wiki source" boundary.
- **(E3) Leave-broken.** Out-of-tree links render as plain
  text or as broken links. Pros: simplest. Cons: hostile UX;
  every citation becomes a manual repo lookup.

### F — Hosting target

Default proposal: **Render static site**, consistent with the
existing Render deployment of `apps/server`. One service per
target; deployment driven by `render.yaml`.

Alternatives:
- Cloudflare Pages (free tier; Git-integrated)
- GitHub Pages (no infra cost; ties to the GitHub repo)

### G — Build trigger

Default proposal: rebuild on every push to `main` that touches
`docs/wiki/` or `apps/wiki-viewer/`. CI workflow:
`.github/workflows/wiki-viewer.yml` (or equivalent on the chosen
hosting target's pipeline).

### H — Search

Default proposal: **none at v1.** A static site of 10 pages does
not need search. INDEX.md provides categorized navigation. If
search is needed later, build-time JSON index + a small
client-side JS layer (Lunr / Pagefind) is the next step — its
own follow-up WP.

---

## Scope (In)

### A) New app structure (`apps/wiki-viewer/`)

- Hugo site configuration (`hugo.toml` or `config.yaml`),
  including explicit determinism knobs per § Non-Negotiable
  Constraints / Determinism
- Layouts directory:
  - `_default/baseof.html` — base template
  - `_default/single.html` — entity page renderer (parses
    front-matter, surfaces `type`/`status`/`tags`/`last-reviewed`
    panel, renders `related` and `source` lists)
  - `_default/list.html` — category landing renderer
  - `_default/_markup/render-link.html` — markdown render hook
    that resolves internal `.md` links to Hugo refs and rewrites
    out-of-tree `../` links per Open Decision E
  - `partials/related.html` — sidebar/bottom partial for
    `related` cross-links
  - `partials/source-citations.html` — rendered `source` list
  - `partials/metadata-panel.html` — top-of-page metadata strip
- Theme assets (CSS only at v1; no JS — see § Non-Negotiable
  Constraints / Determinism)

### A2) Build-time content projection (D-13810 default)

- `apps/wiki-viewer/scripts/project-wiki.mjs` — copies
  `docs/wiki/*.md` to `apps/wiki-viewer/content/wiki/` and
  renames only the copy `INDEX.md → _index.md`. The source
  under `docs/wiki/` is read-only from this script's
  perspective. Invoked before `hugo` in the build pipeline.

### B) Build-time link integrity

A deterministic pre-build script
(`apps/wiki-viewer/scripts/check-links.mjs`) that:

- Operates on the **projected markdown tree** under
  `apps/wiki-viewer/content/wiki/` (not on rendered HTML; HTML
  parsing introduces dependency / nondeterminism risk).
- Extracts internal markdown links of the form `(slug.md)` —
  i.e., links not starting with `http`, `https`, `#`, or `../`.
- Verifies each target markdown file exists **case-sensitively**
  (Windows filesystem is case-insensitive; CI on Linux is not —
  the check must enforce the strict rule even on Windows).
- Fails the build with a non-zero exit and a per-broken-link
  diagnostic if any internal link doesn't resolve.

External URL checks are out of scope (not the wiki's
responsibility per § Non-Negotiable Constraints).

### C) Build pipeline

- Top-level `pnpm wiki-viewer:build` (or equivalent) command
  that delegates to Hugo
- Top-level `pnpm wiki-viewer:dev` (or equivalent) command for
  local preview (`hugo server --port 1313`)
- CI workflow (Open Decision G) wiring

### D) Hosting deployment

Per **Open Decision F**:
- If Render: new static-site service in `render.yaml`
- If Cloudflare Pages: project config + `wrangler.toml`
- If GitHub Pages: workflow + `gh-pages` branch wiring

### E) Documentation update

- Add a "Rendered viewer" section to
  [`docs/wiki/README.md`](../../wiki/README.md) pointing at the
  deployed URL and noting the projection contract.
- No SCHEMA.md modification.

### F) DECISIONS entries

- **D-13808** — Engineering Wiki Viewer: Framework Selection
  (Hugo). Rationale below in § Decisions.
- **D-13809** — External-link strategy lock (per Open Decision E).
- **D-13810** — Reserved-file handling (per Open Decision D).
- **D-13811** — Hosting target lock (per Open Decision F).

(D-13807 was claimed by the `docs-app` category classification in
the same governance pass; verify the next-free `D-NNNN` at session
start in case WP-140 has landed and consumed `D-13808+`.)

### G) Tests

- Build-time link integrity check (described in § Scope (In) B)
  serves as the primary integration test. Failure → non-zero
  exit on `wiki-viewer:build`.
- Smoke test: `pnpm wiki-viewer:build` exits 0 on a clean
  `docs/wiki/` tree.
- Front-matter render test: at least one assertion that the
  rendered HTML for `villain-deck.md` includes the entity's
  `type`, `status`, and at least one `related` link.

---

## Out of Scope

- **Search.** Deferred per Open Decision H. Adding search is a
  separate WP if/when needed.
- **Player-facing documentation.** This is the engineering wiki
  viewer. Player-facing docs are an unrelated future effort
  (per [`docs/wiki/README.md`](../../wiki/README.md)).
- **Schema amendments.** The wiki schema is not modified by this
  WP. Reserved-file handling (Open Decision D) is implemented
  in the *viewer* (build-time rename), not in the schema.
- **MDX or any client-side interactivity.** Forbidden per
  § Non-Negotiable Constraints / Source content discipline.
- **Versioned docs.** v1 renders the current wiki only. Hugo
  supports versioning later if needed; not now.
- **Authentication.** The wiki is internal but not secret. The
  viewer is publicly accessible (or accessible at a stable
  internal URL with no auth gate); no login flow.
- **Comments / annotations / redlining.** Wiki edits go through
  the same PR flow as any other repo change.
- **Engine-source link clicks executing code.** External links
  open as expected; nothing the wiki page links to becomes
  executable from the rendered viewer.

---

## Files Expected to Change

### Created

- `apps/wiki-viewer/hugo.toml` — Hugo site config
- `apps/wiki-viewer/layouts/_default/baseof.html`
- `apps/wiki-viewer/layouts/_default/single.html`
- `apps/wiki-viewer/layouts/_default/list.html`
- `apps/wiki-viewer/layouts/partials/related.html`
- `apps/wiki-viewer/layouts/partials/source-citations.html`
- `apps/wiki-viewer/layouts/partials/metadata-panel.html`
- `apps/wiki-viewer/assets/css/style.css` (or equivalent
  styling pipeline)
- `apps/wiki-viewer/scripts/project-wiki.mjs` — build-time
  content projection (copy `docs/wiki/*.md` →
  `apps/wiki-viewer/content/wiki/`; rename only the copy
  `INDEX.md → _index.md`)
- `apps/wiki-viewer/scripts/check-links.mjs` — pre-build link
  integrity check operating on the projected markdown tree
- `apps/wiki-viewer/layouts/_default/_markup/render-link.html`
  (already listed under § Scope (In) A; called out here for
  the file inventory)
- `apps/wiki-viewer/.hugo-version` (Hugo version pin)
- `apps/wiki-viewer/README.md` (build/dev/deploy instructions)
- `.github/workflows/wiki-viewer.yml` (or equivalent CI per
  Open Decision G)

### Modified

- `pnpm-workspace.yaml` — only if the chosen Open Decision A
  location requires it (default `apps/wiki-viewer/` does not
  require modification if Hugo is treated as a non-pnpm app)
- Top-level `package.json` — add `wiki-viewer:build` /
  `wiki-viewer:dev` scripts if the WP author chooses pnpm
  delegation
- `render.yaml` (or equivalent hosting config) — only if Open
  Decision F selects Render
- `docs/wiki/README.md` — add "Rendered viewer" section with
  the deployed URL
- `docs/ai/DECISIONS.md` — append the four decisions for this
  WP at `D-13808..D-13811` (or the next-free contiguous block at
  execution time if WP-140 has landed and consumed those numbers;
  D-13807 is already claimed by the `docs-app` category classification
  landed in the same governance pass)
- `docs/ai/work-packets/WORK_INDEX.md` — add WP-139 entry
  marked "in-progress" at execution start; "completed" at end

### NOT modified

- `docs/wiki/*.md` (any file other than `README.md`) — the wiki
  source is read-only from the viewer's perspective
- `docs/wiki/SCHEMA.md` — not modified by this WP
- `packages/**` — no engine, registry, or preplan changes
- `apps/server/**` — no server changes; the wiki viewer is a
  separate static site
- `apps/registry-viewer/**` — no changes; separate app
- `apps/arena-client/**` — no changes; separate app

---

## Acceptance Criteria

### Build

- `pnpm wiki-viewer:build` (or chosen equivalent) exits 0 on a
  clean `docs/wiki/` tree.
- Build output exposes exactly **13 content routes**: 10 entity
  pages, 1 section landing (from the projected `_index.md`),
  and one each for `SCHEMA.md` / `README.md`. Hugo's pretty-URL
  output may emit these as `index.html` files inside named
  directories — the count is asserted by **route**, not by raw
  HTML file count, because pretty-URL output and any leaked
  aggregate outputs would inflate a file-count assertion.
- Build is deterministic: two consecutive builds produce byte-
  identical output across the controlled file set
  (`apps/wiki-viewer/public/**/*.html` +
  `apps/wiki-viewer/public/**/*.css`), per § Verification Steps.

### Rendering

- Each entity page's rendered HTML includes:
  - The page `title` as the H1.
  - A metadata panel with `type`, `status`, `last-reviewed`.
  - A tag list rendering the `tags` array.
  - A "Related" section listing each entry in `related` with
    a working link to that entity's rendered page.
  - A "Sources" section listing each entry in `source` with a
    link resolved per Open Decision E.
- The site landing page renders `INDEX.md` content unmodified
  in its body, plus a generated category-grouped sidebar.
- `SCHEMA.md` and `README.md` render as accessible pages
  reachable by URL but absent from the sidebar.

### Link integrity

- Build-time link integrity check passes on a clean
  `docs/wiki/` tree.
- Deliberately introducing a broken `[Title](nonexistent.md)`
  link in any entity page causes the build to fail with a
  non-zero exit and a clear per-broken-link diagnostic.

### Layer boundary

- `grep -rn "@legendary-arena/game-engine\|@legendary-arena/registry\|@legendary-arena/preplan\|apps/server" apps/wiki-viewer/`
  returns zero matches outside of comments / documentation
  files. (Whitelist for `apps/wiki-viewer/README.md` is
  acceptable; no source / template / config file may match.)
- The rendered HTML output contains no JavaScript at v1 (only
  CSS and HTML); a `grep -rl "<script" apps/wiki-viewer/public/`
  returns zero source-code script tags. (Hugo may include a
  livereload script in `dev` mode only; the production `build`
  output is JS-free.)

### Hosting

- If Open Decision F = Render: `render.yaml` declares a new
  `static_site` service named `legendary-arena-wiki` (or
  equivalent); a successful Render deploy produces a publicly
  reachable URL.
- If Open Decision F = Cloudflare Pages: equivalent Cloudflare
  configuration produces a deployed site.
- If Open Decision F = GitHub Pages: equivalent GitHub Pages
  configuration produces a deployed site.

### Documentation

- `docs/wiki/README.md` has a new "Rendered viewer" section
  listing the deployed URL.
- `docs/ai/DECISIONS.md` includes D-13808..D-13811 (or
  retargeted contiguous block if WP-140 landed first; D-13807 was
  appended in the same governance pass as the WP draft for the
  `docs-app` category).
- `docs/ai/work-packets/WORK_INDEX.md` lists WP-139 as
  completed with the execution date.

---

## Verification Steps

```pwsh
# Step 1 — clean build
pnpm wiki-viewer:build
# Expected: exits 0; apps/wiki-viewer/public/ exposes the 13
# rendered routes (10 entity + 1 section landing + SCHEMA + README).

# Step 2 — determinism check (hash the controlled output set)
pnpm wiki-viewer:build
$first = (Get-ChildItem apps/wiki-viewer/public -Recurse `
    -Include *.html, *.css `
  | Sort-Object FullName `
  | ForEach-Object { (Get-FileHash $_.FullName).Hash }) -join "`n"
pnpm wiki-viewer:build
$second = (Get-ChildItem apps/wiki-viewer/public -Recurse `
    -Include *.html, *.css `
  | Sort-Object FullName `
  | ForEach-Object { (Get-FileHash $_.FullName).Hash }) -join "`n"
if ($first -ne $second) { throw "Build is non-deterministic" }
# Expected: no throw.

# Step 3 — link integrity (positive case)
pnpm wiki-viewer:check-links
# Expected: exits 0.

# Step 4 — link integrity (negative case)
# Temporarily introduce a broken link in a wiki page, then:
pnpm wiki-viewer:check-links
# Expected: exits non-zero; diagnostic naming the broken link target.
# (Revert the test break before completion.)

# Step 5 — layer-boundary grep (zero source matches)
Get-ChildItem -Path apps/wiki-viewer -Recurse `
  -Include *.toml, *.html, *.css, *.mjs, *.yml `
| Select-String -Pattern '@legendary-arena/(game-engine|registry|preplan)|apps/server'
# Expected: no matches.

# Step 6 — JS-free production output
Get-ChildItem -Path apps/wiki-viewer/public -Recurse -Filter *.html `
| Select-String -Pattern '<script' -CaseSensitive
# Expected: no matches.

# Step 7 — engine + registry + server tests UNCHANGED
pnpm --filter @legendary-arena/game-engine test
pnpm --filter @legendary-arena/registry test
pnpm --filter @legendary-arena/server test
# Expected: each exits 0; baseline counts UNCHANGED from
# pre-WP-139.
```

---

## Decisions

> **Decision numbering.** The docs-app code-category classification
> claimed `D-13807` in the same governance pass that drafted this WP
> (DECISIONS.md). This WP's four execution-time decisions are
> targeted at `D-13808..D-13811` (the next contiguous free block).
>
> **Race condition with WP-140.** WP-140 on branch
> `claude/stupefied-bhaskara-f7dcc6` claims `D-13901` for the
> `_skipPair` annotation grammar; that branch is unmerged. If
> WP-140 lands first, WP-139 still takes `D-13808..D-13811`
> (contiguous block above the latest landed `D-NNNN` on `main`).
> If WP-139 lands first, no retargeting is needed. The executing
> agent must verify the next-free `D-NNNN` at session start and
> retarget if `D-13808..D-13811` is no longer free.

### D-13808 — Framework Selection: Hugo

**Status:** Locked by this WP at execution.

**Context.** The engineering wiki at `docs/wiki/` is markdown-only
at v1. SCHEMA.md § Publish / Sync Boundary defers a rendered
viewer to a future effort and locks the contract: `docs/wiki/` is
the only authoring location; any rendered output is a read-only
projection.

**Options considered:**
- **Hugo** — Go-based static-site generator. Markdown-native;
  YAML front-matter; build-time templates; no runtime
  JavaScript required; deterministic single-binary build.
- **Docusaurus** — React-based documentation framework. MDX-
  native (Markdown + JSX); built-in sidebar / search /
  versioning; runtime React app with hydration; npm-ecosystem
  dependency footprint.
- **Custom (hand-rolled)** — Bespoke renderer. Maximum control;
  minimum reuse; engineering cost paid by us in perpetuity.

**Decision: Hugo**, with constraints:
1. Static-output only; no runtime backend.
2. No MDX or content-side scripting; pure Markdown + YAML.
3. `docs/wiki/` is the source root; never edited from the viewer.
4. External-link strategy explicit per Open Decision E (this
   WP locks it as D-13809).
5. Reserved-file handling locked per Open Decision D (this WP
   locks it as D-13810).

**Rationale.**
- **Projection contract.** Hugo's `markdown → static HTML`
  model implements exactly the projection rule SCHEMA.md
  requires. No runtime layer to drift from source.
- **Layer-boundary cleanliness.** Static-build-only means no
  runtime imports; `.claude/rules/architecture.md` "viewer
  must not import game-engine / registry" is satisfied
  trivially.
- **Determinism.** Hugo builds are reproducible. Aligns with
  VISION §22 and Architectural Principle #1.
- **Auditability.** Single Go binary; no `node_modules` tree;
  minimal dependency surface.
- **Governance overhead.** Docusaurus pulls a React + MDX +
  npm-dependency surface that requires its own change-budget
  allocation under D-4001..D-4004 every release. Hugo's
  footprint is one binary, one config file, a small template
  tree.

**Docusaurus rejected.** MDX is the strongest practical risk —
it permits embedded React inside wiki pages, directly violating
SCHEMA.md § Scope Exclusion and § Front-Matter Format
(wiki-only YAML). Forbidding MDX while using Docusaurus throws
away the framework's core differentiator; at that point Hugo
wins on every other axis.

**Custom rejected.** Build cost vs. zero feature lift over
Hugo. Hugo's templating model already covers every concrete
need surfaced in this WP (front-matter rendering, related-list
sidebar, navigation, slug-based linking).

**Future-pivot trigger.** Re-evaluate **only if** one of the
following emerges as a concrete need:
1. Wiki needs to embed interactive engine simulations or
   tools inside pages (real React surface required).
2. Audience expands to non-engineers requiring rich UX
   beyond Hugo + custom JS.
3. Page count crosses the SCHEMA.md flat-structure cap (50)
   and the partitioning solution wants framework-native
   section/sidebar handling.

Re-evaluation produces its own DECISIONS entry and supersedes
this one explicitly. Never silently.

### D-13809 — External-link strategy

To be locked at execution per Open Decision E. Default
proposal: GitHub blob rewrite (E1). Implemented via the
`layouts/_default/_markup/render-link.html` markdown render
hook.

### D-13810 — Reserved-file handling

To be locked at execution per Open Decision D. Default
proposal: build-time content projection (copy `docs/wiki/*.md`
→ `apps/wiki-viewer/content/wiki/`; rename only the copy
`INDEX.md → _index.md`); SCHEMA / README accessible-but-
unindexed. No schema change.

### D-13811 — Hosting target

To be locked at execution per Open Decision F. Default
proposal: Render static site.

---

## Vision Alignment

This WP aligns with [`docs/01-VISION.md`](../../01-VISION.md):

- **§15 Built for Contributors.** The rendered wiki removes
  friction from contributor onboarding by making the
  engineering knowledge graph navigable in a browser without
  requiring repo checkout + markdown viewer setup.
- **§14 Explicit Decisions, No Silent Drift.** The DECISIONS
  entries D-13808..D-13811 (default) lock the framework, link
  strategy, reserved-file handling, and hosting; future changes
  require explicit superseding entries.
- **§7 Strict Layer Separation.** The viewer is a new app
  under the existing app pattern; it consumes only the wiki
  source and respects the projection contract.

No primary vision goal is at risk. No non-goal is approached.

---

## Definition of Done

- All acceptance criteria pass.
- All verification steps execute cleanly.
- Four DECISIONS entries (framework selection, external-link
  strategy, reserved-file handling, hosting target) appended
  to `docs/ai/DECISIONS.md` at `D-13808..D-13811` (or
  retargeted contiguous block per § Decisions if WP-140 lands first).
- WP-139 row in `docs/ai/work-packets/WORK_INDEX.md` updated
  to "completed YYYY-MM-DD".
- Rendered viewer is publicly reachable at the URL declared in
  the hosting-target decision (D-13811 by default).
- `docs/wiki/README.md` "Rendered viewer" section names that URL.
- Engine, registry, server, and registry-viewer test baselines
  UNCHANGED from pre-WP-139 (no test count regressions; no
  test count additions in those packages).

---

## Lint Gate Status (DRAFT — not yet invoked)

This WP is a **draft**. The Prompt Lint Gate
(`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) has not yet
been run against it. Items the WP author should verify before
execution:

- **§1 Structure** — required sections present (Goal, Assumes,
  Context, Scope, Out of Scope, Files Expected to Change,
  Acceptance Criteria, Verification Steps, Definition of Done): ✓
- **§2 Non-Negotiable Constraints Block** — present: ✓
- **§3 Prerequisites (Assumes)** — explicit; this WP is BLOCKED
  until the wiki source lands on `main`: ✓
- **§4 Context References** — concrete file paths cited: ✓
- **§5 Output Completeness** — Files Expected to Change now
  enumerates the projection script (`scripts/project-wiki.mjs`)
  and the link-render hook
  (`layouts/_default/_markup/render-link.html`) explicitly.
  The list remains **conditional on Open Decisions A / D / E /
  F / G**. Author must finalize Open Decisions before formal
  lint pass.
- **§6 Naming Consistency** — `apps/wiki-viewer/` matches
  existing `apps/registry-viewer/` pattern: ✓
- **§7 Dependency Discipline** — depends on the wiki source
  being on `main`; explicit in Assumes: ✓
- **§8 Architectural Boundaries** — non-negotiable constraints
  block lists explicit forbidden imports: ✓
- **§9 Windows Compatibility** — Verification Steps use
  PowerShell syntax: ✓ (assuming author confirms Hugo binary
  works on Windows)
- **§10 Env Var Hygiene** — N/A (no new env vars in v1)
- **§11 Authentication Clarity** — N/A (no auth surface; viewer
  is publicly readable)
- **§12 Test Quality** — build-time link integrity check
  defined; smoke test defined; front-matter render test
  defined. **Author must confirm these are sufficient before
  execution.**
- **§13 Commands and Verification** — present and PowerShell-
  formatted: ✓
- **§14 Acceptance Criteria Quality** — concrete and verifiable: ✓
- **§15 Definition of Done** — explicit: ✓
- **§16 Code Style** — applies during execution; not a draft-
  time check (no code yet)
- **§17 Vision Alignment** — present: ✓
- **§18 Prose-vs-Grep Discipline** — Verification Steps use
  greps where appropriate: ✓
- **§19 Bridge-vs-HEAD Staleness** — Assumes block names the
  branch / merge prerequisite: ✓
- **§20 Funding Surface Gate** — N/A (engineering wiki is
  internal; no funding surface introduced)
- **§21 API Catalog Update** — N/A (no HTTP endpoints added;
  static site only)

**Net status:** Draft passes structural lint (§1–§4, §6–§9,
§13–§15, §17–§19) at draft time. **§5 and §12 require Open
Decision lock before formal Final Gate.** §10, §11, §16, §20,
§21 are N/A or deferred-to-execution per their own trigger
conditions.
