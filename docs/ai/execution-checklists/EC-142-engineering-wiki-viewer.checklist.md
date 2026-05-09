# EC-142 — Engineering Wiki Viewer (Execution Checklist)

**Source:** docs/ai/work-packets/WP-139-engineering-wiki-viewer.md
**Layer:** New app (`apps/wiki-viewer/`) — build-time projection of `docs/wiki/`; no runtime imports from `game-engine` / `registry` / `preplan` / `server`.

## Before Starting

- [ ] Lint gate `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` passed for this session
- [ ] **Wiki source on `main`** — 10 entity pages + `SCHEMA.md` + `INDEX.md` + `README.md` from the four `SPEC: wiki ...` commits at the head of `claude/festive-moore-eba215` are merged
- [ ] **Open Decisions A / D / E / F / G locked** in WP-139 §Open Decisions OR in pre-flight DECISIONS entries before execution starts (defaults: A=`apps/wiki-viewer/`, D=`_index.md` build-time rename, E=GitHub blob rewrite, F=Render static site, G=GitHub Actions on push to `main` touching `docs/wiki/` or `apps/wiki-viewer/`)
- [ ] Hugo Extended ≥ 0.120 binary on host; concrete version pin selected for `apps/wiki-viewer/.hugo-version`
- [ ] **DECISIONS numbering verified at session start**: WP-139 targets `D-13808..D-13811` (D-13807 was claimed by the `docs-app` category classification landed in the same governance pass). Procedure at session start:
    - [ ] Read tail of `docs/ai/DECISIONS.md` to confirm the next free `D-NNNN` is still `D-13808`
    - [ ] **If WP-140 (on `claude/stupefied-bhaskara-f7dcc6`) has landed** and consumed `D-13808+`, retarget WP-139's four decisions to the next-free contiguous block above the latest landed `D-NNNN`
    - [ ] Record the retargeting (or confirmation that no retargeting was needed) in pre-flight notes
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0 at REG_BASELINE; `pnpm --filter @legendary-arena/game-engine test` exits 0 at ENG_BASELINE — both unchanged post-execution

## Locked Values (do not re-derive)

- Source root: `docs/wiki/` — **read-only** from the viewer's perspective; only `docs/wiki/README.md` may be modified (add "Rendered viewer" section with deployed URL)
- Total rendered content **routes**: **13** (10 entity pages + 1 section landing from the projected `_index.md` + `SCHEMA.md` + `README.md`); SCHEMA + README accessible by URL but absent from sidebar. Counted by route, not by raw HTML file count (Hugo's pretty-URL output emits per-route `index.html` files inside named directories)
- MDX **forbidden**; pure Markdown + YAML front-matter only (D-13808 rationale; reintroducing MDX silently reopens the rejected Docusaurus path)
- Front-matter surface: `type`, `status`, `tags`, `related`, `source`, `last-reviewed`
- Build-time link integrity: broken **internal** link → non-zero build exit; broken **external** link → warn only (external availability is not the wiki's responsibility). Check operates on the **projected markdown tree** (`apps/wiki-viewer/content/wiki/`), case-sensitive
- Determinism lock: two consecutive builds produce **byte-identical output across the controlled file set** `apps/wiki-viewer/public/**/*.html` + `apps/wiki-viewer/public/**/*.css`. Required Hugo knobs: `enableGitInfo = false`; RSS / sitemap / taxonomy outputs disabled unless explicitly required
- Production output is **JS-free** at v1 (CSS + HTML only); Hugo livereload script is dev-mode only and must not appear in `apps/wiki-viewer/public/`
- Reserved-file handling (D-13810 default): **build-time content projection** — copy `docs/wiki/*.md` → `apps/wiki-viewer/content/wiki/`, rename only the copy `INDEX.md → _index.md`. The source under `docs/wiki/` is never modified by the projection step. SCHEMA.md / README.md remain top-level pages hidden from sidebar
- External-link strategy (D-13809 default): GitHub blob rewrite → `https://github.com/barefootbetters/legendary-arena/blob/main/<path>` for any `../**` link, implemented in `layouts/_default/_markup/render-link.html`
- Hosting target (D-13811 default): Render static-site service named `legendary-arena-wiki` declared in `render.yaml`
- Code category classification (D-13807, **already landed**): both `apps/wiki-viewer/` and `apps/registry-viewer/` fall under the new `docs-app` category in `docs/ai/REFERENCE/02-CODE-CATEGORIES.md`
- Engine / registry / server / registry-viewer test baselines **UNCHANGED** post-execution

## Guardrails

- No runtime imports of `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, or `apps/server/**` at any seam (build, dev, or prod)
- No PostgreSQL / R2 / network access at build or runtime
- `docs/wiki/SCHEMA.md` is **not modified** by this WP; if Hugo rendering surfaces a true schema-amendment need, STOP and route the amendment through a dedicated DECISIONS entry first
- The wiki source contract is read-only: no file under `docs/wiki/` other than `README.md` is modified. The projection step **copies** `docs/wiki/*.md` to `apps/wiki-viewer/content/wiki/` — it does not move, mount, or modify the source. Rename of `INDEX.md → _index.md` happens **only on the copy**
- Hugo theme is **hand-rolled inside `apps/wiki-viewer/`** (Open Decision B default); no third-party theme dependency unless explicitly justified at execution
- 8 Open Decisions (A–H) must each be locked before execution; lint gate §5 and §12 require A / D / E / F / G locked at minimum
- Decision numbering: WP-139 targets `D-13808..D-13811` (D-13807 already landed for the `docs-app` category). The race condition with WP-140 on a parallel branch (claims D-13901 for `_skipPair`) does not currently affect WP-139's block. **At session start, verify D-13808 is still free**; if WP-140 has merged in the interim, retarget to the next contiguous free block above the latest landed `D-NNNN` and record the retargeting in pre-flight
- Verification Step 4 (link-integrity negative case) requires a deliberate broken-link insertion **into the projection target or temporarily into a `docs/wiki/` page** → revert before commit; do **not** leave the broken link in `docs/wiki/`
- Production-output `<script>` grep must return **zero** matches (livereload is dev-mode only; if it leaks, it's a Hugo configuration bug — fix before commit)
- Hugo determinism knobs **must** be set in `hugo.toml` before first build: `enableGitInfo = false`; RSS / sitemap / taxonomy outputs disabled unless explicitly required at v1

## Required `// why:` Comments

- `apps/wiki-viewer/scripts/project-wiki.mjs` header: anchor the projection contract (read-only on `docs/wiki/`; `INDEX.md → _index.md` rename happens only on the copy; D-13810 default)
- `apps/wiki-viewer/scripts/check-links.mjs` header: anchor the broken-internal-link build-fail rule and case-sensitive comparison (lock origin = WP-139 §Non-Negotiable Constraints / Source content discipline)
- `apps/wiki-viewer/layouts/_default/_markup/render-link.html` header: anchor the GitHub-blob URL rewrite rule (D-13809 default) and the rationale for using a Hugo render hook rather than post-build HTML walking
- `apps/wiki-viewer/hugo.toml` header: anchor (a) the determinism knobs (`enableGitInfo = false`, RSS / sitemap / taxonomies disabled) and (b) D-13808 (Hugo framework selection; Docusaurus / custom rejected)
- `apps/wiki-viewer/README.md` header: cross-reference the framework decision and projection contract
- `apps/wiki-viewer/layouts/_default/single.html` metadata-panel partial: anchor the front-matter field surface lock (`type`, `status`, `tags`, `last-reviewed`, `related`, `source`)

## Files to Produce

**Created**:
- `apps/wiki-viewer/hugo.toml` — Hugo site config (with determinism knobs)
- `apps/wiki-viewer/layouts/_default/{baseof,single,list}.html` — base + entity + category templates
- `apps/wiki-viewer/layouts/_default/_markup/render-link.html` — markdown render hook (internal `.md` ref resolution + Open Decision E rewrite)
- `apps/wiki-viewer/layouts/partials/{related,source-citations,metadata-panel}.html` — render partials
- `apps/wiki-viewer/assets/css/style.css` — minimal hand-rolled theme styling
- `apps/wiki-viewer/scripts/project-wiki.mjs` — build-time content projection (copy `docs/wiki/*.md` → `apps/wiki-viewer/content/wiki/`; rename only the copy `INDEX.md → _index.md`)
- `apps/wiki-viewer/scripts/check-links.mjs` — pre-build link integrity check on the projected markdown tree (case-sensitive)
- `apps/wiki-viewer/.hugo-version` — Hugo version pin
- `apps/wiki-viewer/README.md` — build / dev / deploy instructions
- `.github/workflows/wiki-viewer.yml` — CI workflow (Open Decision G default)

**Modified**:
- `pnpm-workspace.yaml` — only if Open Decision A diverges from default `apps/wiki-viewer/`
- `package.json` (top-level) — `wiki-viewer:build` + `wiki-viewer:dev` scripts (Hugo delegation)
- `render.yaml` — new `static_site` service `legendary-arena-wiki` (Open Decision F default)
- `docs/wiki/README.md` — add "Rendered viewer" section with deployed URL
- `docs/ai/DECISIONS.md` — append D-13808..D-13811 (or retargeted contiguous block if WP-140 landed first; D-13807 already landed in the same governance pass for the `docs-app` category)
- `docs/ai/work-packets/WORK_INDEX.md` — add WP-139 row; mark Done at completion
- `docs/ai/execution-checklists/EC_INDEX.md` — add EC-142 row; mark Done at completion
- `docs/ai/STATUS.md` — prepend Phase-equivalent execution summary block

**Explicitly NOT touched** (verify via `git diff --stat`): `docs/wiki/SCHEMA.md`, any other file under `docs/wiki/` except `README.md`, `packages/**`, `apps/server/**`, `apps/registry-viewer/**`, `apps/arena-client/**`, `data/cards/**`.

## After Completing

- [ ] `pnpm wiki-viewer:build` exits 0; `apps/wiki-viewer/public/` exposes the **13 expected routes** (10 entity + 1 section landing + SCHEMA + README — counted by route, not by raw file count)
- [ ] Two consecutive builds produce byte-identical output across the controlled file set (`apps/wiki-viewer/public/**/*.html` + `apps/wiki-viewer/public/**/*.css`) per WP-139 §Verification Steps Step 2
- [ ] `pnpm wiki-viewer:check-links` exits 0 on a clean tree; deliberately-broken link causes non-zero exit with per-link diagnostic; broken link reverted (and never left in `docs/wiki/`)
- [ ] `grep -rn "@legendary-arena/(game-engine|registry|preplan)|apps/server" apps/wiki-viewer/` returns zero matches outside `apps/wiki-viewer/README.md`
- [ ] `grep -rl "<script" apps/wiki-viewer/public/` returns zero matches (production output is JS-free)
- [ ] Engine + registry + server + registry-viewer test baselines UNCHANGED
- [ ] `git diff --stat docs/wiki/` shows only `README.md` modified
- [ ] **Projection-is-copy invariant**: `Get-FileHash docs/wiki/INDEX.md` matches its pre-build hash exactly (the projection step copies, never moves; the source `INDEX.md` must survive untouched). Capture pre-build hash before first `pnpm wiki-viewer:build` invocation; assert post-build. Any divergence indicates a `mv`-vs-`cp` regression in `scripts/project-wiki.mjs` and is a stop-ship
- [ ] `WORK_INDEX.md` WP-139 row Draft → Done with date + commit hash; `EC_INDEX.md` EC-142 row Draft → Done; `STATUS.md` updated; the four decisions appended to `DECISIONS.md` at `D-13808..D-13811` (or the retargeted contiguous block if WP-140 landed first; verify next-free at session start)
- [ ] Rendered viewer publicly reachable at the URL declared in the hosting decision; URL recorded in `docs/wiki/README.md`'s new "Rendered viewer" section
- [ ] 01.6 post-mortem authored if triggers fire (new long-lived app under `apps/wiki-viewer/`; first build-time projection of `docs/wiki/`; Hugo framework adoption)

## Common Failure Smells

- **MDX accidentally enabled** via a third-party theme that bundles MDX support — silently reopens the rejected Docusaurus path. Fix: stay on hand-rolled theme (Open Decision B default); audit theme dependencies if a non-default theme is selected.
- **`<script>` tag in production HTML** — usually a Hugo livereload leak from `hugo server` config bleeding into `hugo` (production build). Fix: confirm `hugo.toml` `[server]` block is dev-only; production build invocation uses bare `hugo` with no `--watch`.
- **Internal link case-mismatch passes locally on Windows but fails in CI on Linux** — Windows filesystem is case-insensitive; Linux is case-sensitive. Fix: link-integrity check must be case-sensitive even on Windows; assert via deliberate-mismatch test before commit.
- **D-13808+ numbering race with WP-140** — WP-139 currently targets D-13808..D-13811 (D-13807 landed for the `docs-app` category). WP-140 on `claude/stupefied-bhaskara-f7dcc6` claims D-13901 (one number) and is unmerged at WP-139 draft time. Symptom: if WP-140 lands first claiming `D-13808` (because its draft text retargets too), DECISIONS.md append at WP-139 execution silently collides. Fix: at session start, read tail of `DECISIONS.md` and verify `D-13808` is still free; if not, retarget to next-free contiguous block and record in pre-flight.
- **Build non-determinism from template-side `now` or `time.Now`** — Hugo's `now` function or any template embedding the build timestamp breaks the byte-identical determinism lock. Fix: scrub `now` / `time.Now` / `os.Getenv` from templates; rely only on front-matter and source content.
- **`enableGitInfo` left at default** — Hugo's git-info feature embeds commit-derived `lastmod` fields into rendered HTML, breaking determinism whenever HEAD moves. Fix: explicit `enableGitInfo = false` in `hugo.toml`; verify before first build.
- **Default sitemap / RSS leaking into output** — Hugo emits `sitemap.xml` and per-section `index.xml` (RSS) by default; both can embed timestamps and inflate any file-count assertion. Fix: disable these outputs in `hugo.toml` at v1; the determinism check hashes only `*.html` + `*.css` so a leak is non-fatal but still indicates the knob wasn't set.
- **Schema amendment temptation** when Hugo balks at uppercase `INDEX.md` — Open Decision D defaults to build-time content projection (copy + rename), NOT a schema change. Fix: implement the projection step in `scripts/project-wiki.mjs`; never modify `docs/wiki/SCHEMA.md` or rename the source `INDEX.md` from this WP.
- **Projection step accidentally moves instead of copies** — if `project-wiki.mjs` uses `rename` / move semantics instead of copy, the source `docs/wiki/INDEX.md` disappears and the read-only contract breaks silently. Fix: use file copy explicitly; assert `docs/wiki/INDEX.md` still exists after projection runs (cheap post-step assertion).
- **Render hook missing → out-of-tree links render as broken anchors** — without `layouts/_default/_markup/render-link.html`, Hugo emits `../packages/foo` literally and the rendered viewer shows broken links for every `source` citation pointing outside `docs/wiki/`. Fix: implement the render hook; verify a representative `source: ../ai/ARCHITECTURE.md` link resolves to a working GitHub blob URL in built HTML.
