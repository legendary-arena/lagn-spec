# WP-145 — Architecture Inventory ↔ Engineering Wiki Integration

**Status:** Draft (drafted 2026-05-09; not yet executed; lint gate not yet
invoked — execution requires `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`
pass; not yet added to `WORK_INDEX.md`).
**Primary Layer:** Tooling pipeline + `apps/wiki-viewer/` build pipeline.
The script under `scripts/architecture-inventory.mjs` is cross-cutting
(no package); the consumer is the wiki-viewer's projection chain. No
runtime imports into `game-engine`, `registry`, `preplan`, or `server`
are introduced.
**Dependencies:**
1. WP-139 (Engineering Wiki Viewer) — landed on `main` per
   `5a47da2 EC-142: introduce apps/wiki-viewer/`. The viewer's
   build-time projection (`apps/wiki-viewer/scripts/project-wiki.mjs`)
   and the locked decisions D-13807..D-13811 (and the source-relocation
   amendment D-13812) are the contract this WP composes with.
2. `scripts/architecture-inventory.mjs` already exists on `main` per
   `7963c29 INFRA: architecture-inventory — surface apps/wiki-viewer in
   Application stacks`. This WP integrates the existing tool; it does
   not author or extend it.

**Supersedes:** none.

**Purpose (one-line):** surface the deterministic architecture
inventory report as a first-class, automatically-refreshed page on
the engineering wiki without violating wiki-source-readonly or
build-determinism contracts, and without modifying the inventory
script itself.

---

## Session Context

The engineering wiki at [`wiki/`](../../wiki/) is markdown-only;
[`apps/wiki-viewer/`](../../apps/wiki-viewer/) projects it to a Hugo
static site that ships to `https://ewiki.legendary-arena.com/`. The
wiki source contract (per [`wiki/SCHEMA.md` § Publish / Sync
Boundary](../../wiki/SCHEMA.md)) is hard-locked: `wiki/` is the only
authoring location; the published site is a **read-only projection**.
WP-139's D-13810 (and amendment D-13812) implement that contract via a
build-time copy from `wiki/*.md` into `apps/wiki-viewer/content/`.

Separately, [`scripts/architecture-inventory.mjs`](../../scripts/architecture-inventory.mjs)
is a deterministic monorepo report. It scans `package.json` files and
source imports across `packages/**` and `apps/**`, buckets dependencies
into curated categories, and emits a markdown report. Run as
`node scripts/architecture-inventory.mjs --out FILE`. The script header
is explicit that it is a reporting tool, not a gate (always exit 0
unless the script itself crashes), and that its output is *evidence-
based*, not recommendation-bearing — recommendations are intentionally
left as LLM judgment work downstream of the report.

The two artifacts do not currently meet. The inventory's output:

- Is not committed under `wiki/`.
- Is not invoked by `apps/wiki-viewer/`'s build (neither
  `project-wiki.mjs` nor any pre-build step).
- Therefore does not appear at `ewiki.legendary-arena.com/`.

This is a pipeline absence, not a bug. It is also a governance question:
the wiki schema is built around hand-authored entity pages with
front-matter typed against a closed enum (`Mechanic` / `System` /
`Card-Type` / `Keyword` / `Concept`); a generated artifact does not fit
that enum. The schema accommodates `SCHEMA.md`, `README.md`, `INDEX.md`
as reserved files that bypass the entity contract. Whether
`architecture-inventory.md` should be treated similarly, treated as a
new entity-page subtype, or live entirely outside `wiki/` is a
sub-decision this WP surfaces and locks via D-14503 at execution.

---

## Goal

After this packet:

1. The architecture inventory output is reachable at a stable URL on
   `ewiki.legendary-arena.com/` (path locked at execution per Open
   Decision B). Following any merge to `main` that triggers an
   inventory regeneration (cadence locked per Open Decision A), the
   rendered page reflects the inventory script's output for the
   then-current commit.
2. Generation is automated. Manual `node scripts/architecture-
   inventory.mjs --out ...` invocations remain possible for local
   debugging, but the deployed wiki's freshness does not depend on a
   human remembering to regenerate.
3. The wiki source contract (D-13810 / D-13812: `wiki/` is read-only
   from the viewer's perspective; the projection is one-way from
   `wiki/*.md` → `apps/wiki-viewer/content/`) is preserved or
   explicitly amended via a new DECISIONS entry locked under this WP.
4. The inventory script is unmodified by this WP. The integration is
   purely about *where its output lands and when it runs*.
5. Hugo build determinism (D-13808 constraints — byte-identical
   output across consecutive builds) is preserved. The inventory's
   own determinism (the script reads filesystem state and emits a
   stable markdown report; UTC date in the header is the only
   intentional time-dependence) is the binding constraint at the
   integration boundary.

The schema accommodation question (whether the inventory page is a
reserved file, an entity-page subtype, or a non-wiki artifact) is
locked at execution per Open Decision C below; the goal above holds
for whichever sub-option is selected.

---

## Assumes

- WP-139 is on `main`. The viewer at `apps/wiki-viewer/` exists, the
  projection script `apps/wiki-viewer/scripts/project-wiki.mjs` runs,
  and the GitHub workflow at `.github/workflows/wiki-viewer.yml`
  builds and deploys to Render's static-site host. Verified by
  inspection of `main` HEAD.
- `scripts/architecture-inventory.mjs` is on `main` and runnable with
  `node scripts/architecture-inventory.mjs --out -` from the repo
  root. Its output format matches the script header's contract (one
  markdown document; deterministic given identical filesystem
  contents; UTC date in header).
- `wiki/SCHEMA.md` is the locked schema contract. This WP does not
  modify the entity schema. If schema accommodation is required (Open
  Decision C, sub-options C2 / C3), it is a SCHEMA.md amendment + a
  DECISIONS entry, both landed in this WP.
- `pnpm --filter @legendary-arena/registry test` and
  `pnpm --filter @legendary-arena/game-engine test` exit 0 at session
  start (the integration introduces no engine or registry change but
  WP discipline requires baseline-clean state).
- `docs/ai/DECISIONS.md` highest landed entry was D-13901 (WP-140) at
  WP-145's initial draft on 2026-05-09; WP-144 has since landed via
  `bb0493c` + `8a0621a`, claiming D-14401. The next-free contiguous
  block above is D-14501; WP-145 claims `D-14501..D-14503` accordingly.
  The executing agent must re-verify the next-free `D-NNNN` at session
  start and retarget if any sibling WP has consumed the block in the
  interim.
- A working Node 22+ runtime is available on the development host (the
  inventory script uses built-in `fetch` via Node 22; matches the rest
  of the repo's Node version assumption per `.claude/CLAUDE.md`
  Quick Reference).

If any of the above is false this packet is **BLOCKED**.

---

## Context (Read First)

Mandatory reading before execution:

- [`scripts/architecture-inventory.mjs`](../../scripts/architecture-inventory.mjs)
  — the script's header `// why:` block documents output format,
  exit-code semantics, and the deterministic UTC-date header. Read
  end-to-end before deciding which integration option fits.
- [`wiki/SCHEMA.md`](../../wiki/SCHEMA.md) — especially:
  - § Publish / Sync Boundary (the read-only projection rule;
    option (b) below is the contentious one against this rule)
  - § Scope Exclusion (the wiki is descriptive, not prescriptive;
    confirms an architecture-inventory artifact is in-scope by
    purpose, but does not address the entity-schema fit)
  - § Entity Types (closed set) and § File Layout (reserved files
    convention) — both bear on Open Decision C
  - § Lint Targets (the schema's accommodation of generated content
    is implicit; no lint target today asserts entity-schema
    conformance, but this WP's accommodation must not break a future
    lint script)
- [`apps/wiki-viewer/scripts/project-wiki.mjs`](../../apps/wiki-viewer/scripts/project-wiki.mjs)
  — the existing build-time projection. Whichever integration
  option locks, it must compose with this script (run before, after,
  or alongside; never replace; never bypass).
- [`apps/wiki-viewer/hugo.toml`](../../apps/wiki-viewer/hugo.toml)
  — the Hugo config and its determinism knobs (D-13808 constraints).
  An inventory page must render through the existing front-matter
  contract or via Open Decision C's reserved-file path.
- [`.github/workflows/wiki-viewer.yml`](../../.github/workflows/wiki-viewer.yml)
  — the existing CI workflow. Option (b) extends this workflow;
  options (a) and (c) interact with it differently.
- [`docs/ai/work-packets/WP-139-engineering-wiki-viewer.md`](WP-139-engineering-wiki-viewer.md)
  — D-13807..D-13811 (and the amendment D-13812) define the
  contract this WP composes with. § Open Decisions D / E / F / G
  and the locked values in § Decisions are particularly relevant
  to Open Decision A (build trigger / cadence) and B (rendered URL).
- [`docs/ai/ARCHITECTURE.md` §Layer Boundary (Authoritative)](../ARCHITECTURE.md#layer-boundary-authoritative)
  — the inventory script is cross-cutting (lives in `scripts/`,
  not in any package); the viewer is `docs-app` per D-13807.
  Neither layer imports the other at runtime.
- [`.claude/rules/work-packets.md`](../../../.claude/rules/work-packets.md)
  — one WP per session; dependency discipline; status update rules.
- [`.claude/rules/architecture.md`](../../../.claude/rules/architecture.md)
  — Layer Boundary; the viewer must not introduce runtime imports
  into `game-engine` / `registry` / `preplan` / `server`; the inventory
  integration must not change that.

---

## Non-Negotiable Constraints

These are hard rules. Violations are blockers; refactor instead.

### Wiki source contract (D-13810 / D-13812)

- The integration must not violate the read-only-source contract
  unless it lands an explicit DECISIONS amendment to D-13810. If
  Open Decision B routes the report to `wiki/architecture-
  inventory.md` directly, the *generation* must occur before any
  human authoring would land — i.e., the file is treated as a
  generated artifact that is committed-then-projected, with the
  invariant that the generator is the only writer. That invariant
  needs an explicit DECISIONS entry naming the inventory file as
  the sole exception, listing the generator as its sole author,
  and stating that hand-edits to the generated file are forbidden
  and silently overwritten on next regeneration.
- If Open Decision B routes the report to a viewer-internal staging
  path (e.g., `apps/wiki-viewer/content/architecture-inventory.md`
  written *after* `project-wiki.mjs` runs), no D-13810 amendment
  is required, but the projection script's contract assertion must
  be updated to permit additional files in `content/` that did not
  originate in `wiki/`.
- **(B1-specific governance for `wiki/architecture-inventory.md`):**
  - The file is treated as **generated content**, never
    hand-authored.
  - Any manual edits are **non-authoritative** and will be silently
    overwritten by the next regeneration run.
  - The inventory script is the **sole writer** of this file; this
    is the binding invariant that justifies the D-13810 amendment.
  - A future lint rule MAY assert that the committed file matches
    the script's current output exactly (drift detection). This WP
    does not introduce that lint, but **reserves the right** under
    a follow-up WP without re-amending D-13810.

### Script non-gating posture

- The inventory script header is explicit: it is a reporting tool,
  not a gate (always exit 0 unless the script itself crashes). The
  integration must **preserve this non-gating property**: an
  inventory failure must not block unrelated pipelines (the wiki
  deploy, engine tests, registry tests, etc.).
- Elevating the script to a gate (e.g., failing the wiki-viewer
  workflow on inventory regression) is explicitly **out of scope**
  for this WP and must be its own follow-up WP with its own
  DECISIONS amendment.

### Build determinism (D-13808)

- The integration must not break the byte-identical-output
  determinism check that
  [`.github/workflows/wiki-viewer.yml` §Determinism check](../../.github/workflows/wiki-viewer.yml)
  enforces. Two consecutive Hugo builds against the same content
  must produce identical `*.html` + `*.css` output.
- The inventory script's only intentional time-dependence is the
  UTC date in its header (`TODAY_UTC`). If integration option (b)
  places the script *inside* the per-build pipeline (re-running on
  every Hugo build), the UTC-date header changes across day
  boundaries and could trip the determinism check on a build that
  happens to straddle midnight UTC. Mitigation strategies:
  - **Option (b) only:** lock the date input to the most recent
    commit timestamp (deterministic given the commit) rather than
    `Date.now()`; this is a script change and is **out of scope**
    for this WP — option (b) therefore cannot be selected without
    a sibling WP that hardens the script's date input.
  - **Options (a) and (c):** the script runs at human cadence or
    on a CI cron, not per-Hugo-build, so the UTC-date header is
    stable for the duration of a single Hugo build.

### Layer boundary

- The inventory script lives in `scripts/`, outside any package.
  The integration must not import the script from
  `apps/wiki-viewer/**` source code; the script is invoked via
  the shell / `node` binary, not via JavaScript import.
- No new runtime dependency on `game-engine`, `registry`,
  `preplan`, or `apps/server`. The script already respects this
  (it reads `package.json` files at the filesystem level and does
  no imports of internal packages); the integration adds no new
  surface.

### Inventory script immutability

- This WP must not modify `scripts/architecture-inventory.mjs`. The
  script's contract — input format, output format, exit semantics,
  CLI flags — is the binding interface. If integration surfaces a
  script bug or a missing flag, that is its own follow-up WP, not
  drift folded into this one.
- The one explicit exception: the integration may invoke the script
  with `--out FILE` to redirect output to a chosen path. That is
  its documented CLI surface, not a modification.

---

## Recommended Execution Profile (Non-Binding)

To reduce execution variance and minimize contract pressure, the
recommended path is:

- **A3** — CI-scheduled regeneration (weekly cron)
- **B1** — `wiki/architecture-inventory.md`
- **C1** — Reserved-file accommodation
- **D1** — PR-on-diff

Rationale:

- Preserves D-13810 with minimal amendment surface (single-file
  exception, explicitly named in D-14502).
- Avoids the build-determinism risk tied to UTC-date drift (A2 is
  conditionally blocked on a sibling script-hardening WP — see
  Open Decision A below).
- Maintains auditability via git history (each regeneration is a
  PR or commit, reviewable in retrospect).
- Aligns with the project's existing governance bias toward review
  gates over silent automation.

The executing agent may override this profile, but any deviation
must be explicitly justified in `D-14501..D-14503`. The
Compatibility Matrix below enumerates which deviations remain
valid and which are blocked.

---

## Open Decisions (the WP author locks each before execution)

These decisions are unbound at draft time. Each must be locked in
this WP's body or in a dedicated DECISIONS entry before execution
starts. The Recommended Execution Profile above suggests one
default; the matrix after this section shows valid alternatives.

### A — Generation cadence

> ⚠️ **A2 is CONDITIONALLY BLOCKED under this WP.** The script's
> UTC-date header makes per-build invocation non-deterministic
> across midnight, and hardening the script's date input is out
> of scope (script-immutability rule). A2 cannot be selected
> unless a sibling WP that lands the date-input hardening is on
> `main` first. See A2 below for the full constraint chain.

The inventory's freshness is bounded by how often the script runs.
Three options:

- **(A1) One-shot manual.** A human runs the script when they want
  the wiki refreshed, commits the output, and pushes. The wiki
  reflects the most recent manual run. Pros: zero CI cost; the
  human is the gate, so review is implicit. Cons: stale by default;
  freshness depends on memory.
- **(A2) Build-pipeline integration — CONDITIONALLY BLOCKED.**
  The script runs as a step in
  `.github/workflows/wiki-viewer.yml` before `project-wiki.mjs`,
  writing output into the projected content tree.
  Constraint escalation:
  - The inventory script's UTC-date header introduces a
    non-deterministic input across day boundaries, which
    violates D-13808 unless the date source is stabilized.
  - Stabilizing the date requires modifying the script, which
    is **out of scope for this WP** per § Non-Negotiable
    Constraints / Inventory script immutability.
  - In addition, A2 turns a "reporting tool" into a deploy
    gate (a script crash would block the wiki deploy), which
    contradicts the script header's "not a gate" contract.
  Therefore:
  - **(A2) MUST NOT be selected** unless a sibling WP lands
    first that hardens the inventory script's date input to
    a commit-derived deterministic value.
  - Without that prerequisite, selecting (A2) under WP-145 is
    a **BLOCKER**; the executing agent must reject the lock.
- **(A3) CI-scheduled regeneration.** A separate workflow
  (`.github/workflows/architecture-inventory.yml`) runs the
  script on a cron schedule (weekly is the conservative
  default; daily is the aggressive option). On output diff, the
  workflow opens a PR (or commits directly to `main`, depending
  on the lock). Pros: `wiki/` stays human-author-clean (PR review
  is the gate); freshness is bounded by cron interval; lower
  contract tension than (A2); script crashes don't block site
  deploys. Cons: more CI surface; freshness is at most one cron
  cycle stale.

The WP author locks one before execution. No default proposal
here; the trade-offs are real and route to the author's
preference between freshness, contract pressure, and review
discipline.

### B — Output file location

Independent of A. Where does the generated markdown live?

- **(B1) `wiki/architecture-inventory.md`** — committed under
  the wiki source. Visible in `git log`; reviewable as a wiki
  page; participates in the existing wiki-viewer projection
  pipeline unchanged. Requires a D-13810 amendment that names
  this file as the single permitted generator-authored
  exception to the human-only-authoring rule. Couples cleanest
  with cadence (A3); coupled with (A1) is fine; coupled with
  (A2) requires the additional staging consideration below.
- **(B2) `apps/wiki-viewer/content/architecture-inventory.md`**
  — written by a viewer-internal step *after* `project-wiki.mjs`
  runs. Never appears in `wiki/`. Requires `project-wiki.mjs`'s
  contract to permit additional viewer-injected files in
  `content/`. The wiki source remains untouched, satisfying
  D-13810 verbatim. Loses git-log visibility of inventory
  changes (the file is never committed); freshness is per-build
  rather than per-commit.
- **(B3) Sibling `wiki/_generated/architecture-inventory.md`**
  — committed under a `_generated/` subdirectory inside `wiki/`.
  The leading underscore signals "not human-authored"; the
  projection script special-cases the directory (or treats it as
  ordinary `wiki/*.md` content given the SCHEMA.md "no
  subdirectories" rule — which is itself a SCHEMA amendment). The
  flat-structure rule in SCHEMA.md § File Layout is the obstacle
  here; (B3) is technically possible but expensive in schema
  surface.

The Schema amendment work scales with the choice: (B1) needs a
DECISIONS amendment but no SCHEMA.md change; (B2) needs no schema
work but does need a `project-wiki.mjs` contract update; (B3)
needs a SCHEMA.md amendment plus DECISIONS.

### C — Schema accommodation

How does the inventory page fit `wiki/SCHEMA.md`'s entity contract?

The schema's entity-page contract requires front-matter with
`title` / `type` / `tags` / `related` / `status` / `source` /
`last-reviewed`, and `type` is closed to
`{ Mechanic, System, Card-Type, Keyword, Concept }`. None of these
fit a generated architecture inventory.

- **(C1) Reserved-file accommodation.** Treat
  `architecture-inventory.md` like SCHEMA.md / README.md /
  INDEX.md — a reserved filename outside the entity-page contract.
  Add it to the reserved list in SCHEMA.md § File Layout and §
  Reserved Filenames. The page renders without front-matter or
  with a minimal generated front-matter that the viewer's
  templates handle as a special case. Smallest schema delta.
- **(C2) New entity type.** Extend the closed `type` enum with
  a new value (`Generated`, `Report`, or `Inventory`). The page
  carries normal front-matter with `type: Generated`. Larger
  schema delta but generalizes if other generated artifacts land
  later (drift reports, decision-coverage matrices, etc.).
- **(C3) Out-of-wiki rendering.** The inventory does not enter
  `wiki/` at all. It renders as a non-wiki page in the Hugo
  site (a separate Hugo content section, e.g., `reports/`).
  Largest pipeline delta (new Hugo section + layout) but zero
  schema impact.

(C) interacts with (B): (B2) is compatible with all of (C1) /
(C2) / (C3); (B1) is compatible with (C1) / (C2); (B3) is
compatible with (C1) / (C2) only.

### D — Diff-detection and commit policy

If cadence is (A3), the workflow needs a policy for how to handle
"no diff" vs "diff present" runs:

- **(D1) Open a PR on diff; do nothing on no-diff.** Human review
  is the gate; PR title + body summarize the diff. Conservative.
- **(D2) Direct commit to `main` on diff (with `[skip ci]` on the
  commit message to avoid recursive workflow runs).** Faster
  freshness; no review gate. Trades safety for speed.
- **(D3) Open a PR on diff with `auto-merge` enabled when CI
  passes.** Hybrid; review window without manual merge.

If cadence is (A1) or (A2), this decision is moot.

---

## Decision Compatibility Matrix

| A (Cadence) | B (Location) | C (Schema) | Status |
|---|---|---|---|
| A1 | B1 | C1 / C2 | ✅ Valid |
| A1 | B2 | C1 / C2 / C3 | ✅ Valid |
| A1 | B3 | C1 / C2 | ⚠️ High schema cost (B3 needs SCHEMA flat-structure amendment) |
| A2 | any | any | ❌ BLOCKED — see § Open Decisions / A2 constraint escalation |
| A3 | B1 | C1 / C2 | ✅ **Preferred** (Recommended Execution Profile) |
| A3 | B2 | C1 / C2 / C3 | ✅ Valid |
| A3 | B3 | C1 / C2 | ⚠️ High schema cost (as A1+B3) |

Notes:

- **B3 is high-friction.** It requires a SCHEMA.md amendment to
  the flat-structure rule (§ File Layout: "There are no
  subdirectories"). Treat as a deliberate trade-off, not a
  default.
- **C3 is a divergence from wiki-first philosophy.** Routing the
  inventory through a separate Hugo `reports/` section means it
  no longer participates in the wiki's authoring discipline at
  all. Valid, but reserve for cases where C1 / C2 are
  unworkable.
- **C3 ↔ B1 / B3 are not co-selectable.** If the inventory does
  not enter `wiki/` (C3), B1 and B3 are nonsensical (they put
  the file *in* `wiki/`). The matrix above already excludes
  those rows.

---

## Scope (In)

**Scope model:** this WP defines *all possible integration paths*,
but **only the locked option set executes**. The list below
enumerates everything that could land under any combination of
the lockable choices; the executing agent narrows it to the actual
selected combination at session start. Items not reached by the
locked combination are out of scope **for that execution**, not
out of scope for the WP as written.

Scope below is **conditional on Open Decisions A / B / C / D**.

### A) Inventory invocation harness (always in scope)

- A documented invocation pattern for the inventory script that
  lands in `apps/wiki-viewer/README.md` or in a top-level
  `scripts/README.md` (whichever fits the locked cadence). Names
  the exact `node scripts/architecture-inventory.mjs --out <path>`
  command, the chosen `<path>` per Open Decision B, and the
  intended cadence per Open Decision A.

### B) Cadence wiring (one of (A1) / (A2) / (A3))

- **(A1):** No new CI surface. A `pnpm` script (e.g.,
  `pnpm wiki-viewer:inventory`) wraps the inventory invocation
  with the locked output path. Documentation update only.
- **(A2):** A new step in `.github/workflows/wiki-viewer.yml`
  that runs the inventory script before `project-wiki.mjs`.
  The step must be no-op if the script crashes (the inventory
  is a reporting tool; a crash must not break the deploy of the
  rest of the wiki). The UTC-date determinism risk (see
  § Non-Negotiable Constraints / Build determinism) is the
  binding objection — selecting (A2) requires either accepting
  the date-flip risk on cross-midnight builds or adding a
  sibling WP that hardens the script's date input. **This WP
  does not modify the script.**
- **(A3):** A new file `.github/workflows/architecture-
  inventory.yml`. Cron schedule (locked at execution; the
  default for this option is weekly: `cron: '0 6 * * 1'`,
  Mondays at 06:00 UTC). The workflow runs the inventory script,
  writes to the locked output path, and applies the locked diff
  policy (Open Decision D).

### C) Output file landing (one of (B1) / (B2) / (B3))

- **(B1):** First execution commits `wiki/architecture-inventory.md`.
  Subsequent executions overwrite it.
- **(B2):** No file is committed. The viewer build pipeline writes
  `apps/wiki-viewer/content/architecture-inventory.md` after
  projection runs. `apps/wiki-viewer/.gitignore` excludes the path
  if it is not already implicit (it is, since `content/` is the
  projection target).
- **(B3):** First execution commits
  `wiki/_generated/architecture-inventory.md` with the schema
  amendment under § F below.

### D) Schema accommodation (one of (C1) / (C2) / (C3))

- **(C1):** SCHEMA.md additions:
  - § Reserved Filenames: row for
    `architecture-inventory.md` with the description "Generated
    architecture and library-adoption inventory; sole writer is
    `scripts/architecture-inventory.mjs`."
  - § File Layout: the reserved-file list is updated to match.
  - § Lint Targets: the conformance list is amended to except the
    inventory page from front-matter requirements.
- **(C2):** SCHEMA.md additions:
  - § Entity Types: the closed enum gains a new row (label
    locked at execution).
  - The page lands as a regular entity with front-matter
    `type: <new label>`, `status: canonical` (or `draft` until
    the script's first successful CI run lands), and an empty
    `related: []` (the inventory is a leaf entity by design).
- **(C3):** SCHEMA.md additions:
  - None directly. A new Hugo content section under
    `apps/wiki-viewer/content/reports/` is created;
    `project-wiki.mjs` (or a sibling script) writes the
    inventory there. The wiki schema is unchanged; the
    rendered site grows a `reports/` URL space.

### E) Hugo template adjustments (conditional)

- (C1) needs no template change if the existing default Hugo
  layout renders front-matterless `.md` cleanly; if it does not,
  a minimal `apps/wiki-viewer/layouts/_default/inventory.html`
  template is added.
- (C2) needs no template change; the existing entity-page
  template renders the new type cleanly.
- (C3) needs a new `apps/wiki-viewer/layouts/reports/single.html`
  template plus a section landing `apps/wiki-viewer/layouts/
  reports/list.html`.

### F) DECISIONS entries

- **D-14501** — Architecture inventory cadence (locks Open
  Decision A and, if A=A3, Open Decision D).
- **D-14502** — Architecture inventory output file location
  (locks Open Decision B; amends D-13810 if B=B1).
- **D-14503** — Architecture inventory schema accommodation
  (locks Open Decision C; amends `wiki/SCHEMA.md` if C=C1 or
  C=C2).

The next-free `D-NNNN` block is verified at session start.
WP-144 is in-flight on a sibling worktree and claims D-14401;
WP-145 takes the next contiguous free block above that. If
WP-144 has landed before WP-145 executes, no retargeting is
needed. If a sibling WP lands between WP-144 and WP-145 and
consumes D-14501..D-14503, retarget to the next free block and
record the retargeting in the executing session's notes.

### G) Tests

- **(C1) / (C2):** A smoke check that `pnpm wiki-viewer:build`
  exits 0 with the inventory page present in the output, and
  that the existing determinism check (two consecutive builds,
  byte-identical `*.html` + `*.css`) still passes. The check
  is added to `.github/workflows/wiki-viewer.yml` only if it
  is not already there for the entity-page set.
- **(C3):** Same smoke check, scoped to the new `reports/`
  section.
- **All options:** A negative-path assertion that running
  `node scripts/architecture-inventory.mjs --out <locked-path>`
  twice produces byte-identical output (the script's
  determinism contract; protects against regressions in the
  script itself by failing the integration when the script
  drifts).

---

## Out of Scope

- **Modifying `scripts/architecture-inventory.mjs`.** Per
  § Non-Negotiable Constraints / Inventory script immutability.
  Date-input hardening (required if Open Decision A locks A2) is
  its own follow-up WP.
- **Surfacing inventory recommendations.** The script header is
  explicit: it does not recommend; recommendations are LLM
  judgment work downstream. A "next steps" or "gap analysis"
  section in the rendered page is **out of scope**; the page
  renders the script's raw output unchanged.
- **Adding more reports.** This WP integrates the architecture
  inventory only. Other reporting tools (drift checks, decision-
  coverage matrices) are sibling WPs if they ever land.
- **Linking the inventory page from `wiki/INDEX.md`.** The wiki
  index is hand-authored and curates entity pages; whether the
  inventory belongs in INDEX.md is a downstream editorial
  decision, not part of this WP. (If selected, it goes under a
  new "Generated artifacts" subsection — also a follow-up.)
- **Authoring narrative around the inventory output.** The
  rendered page is the script's raw markdown. Any explanatory
  prose (architecture overview, layer-boundary commentary) lives
  in entity wiki pages that *cite* the inventory, not in the
  inventory itself.
- **Search.** Inherits from WP-139 § Open Decision H — search is
  deferred.
- **Deleting `architecture-inventory` artifacts from non-wiki
  locations.** If anyone has been running the script manually and
  saving the report under `docs/`, those locations are not
  cleaned up by this WP (cleanup is editorial; do it in a
  separate follow-up if at all).

---

## Files Expected to Change

The list below names every file that *could* be touched under any
locked combination of Open Decisions. The executing agent narrows
it after locking.

### Created

- **(A3 only):** `.github/workflows/architecture-inventory.yml`
  — cron-driven inventory regeneration workflow.
- **(B1 only):** `wiki/architecture-inventory.md` — generated;
  first commit lands the initial output.
- **(B3 only):** `wiki/_generated/architecture-inventory.md` and
  `wiki/_generated/.gitkeep` — the new generated subtree.
- **(C3 only):** `apps/wiki-viewer/layouts/reports/single.html`
  and `apps/wiki-viewer/layouts/reports/list.html` — Hugo
  templates for the new section.
- **(C1 only, if existing default template doesn't render
  front-matterless markdown cleanly):** `apps/wiki-viewer/
  layouts/_default/inventory.html` — minimal template for the
  reserved-file inventory page.

### Modified

- `apps/wiki-viewer/README.md` — document the inventory
  invocation pattern under a new "Generated content" subsection.
- `apps/wiki-viewer/scripts/project-wiki.mjs` — **only** if Open
  Decision B locks B2; the projection target is augmented to
  permit the post-projection write of the inventory file. If
  B locks B1 or B3, this script is unchanged.
- `.github/workflows/wiki-viewer.yml` — **only** if Open Decision
  A locks A2; a new step runs the inventory script before
  `project-wiki.mjs`.
- `package.json` (top-level) — add a script alias
  `wiki-viewer:inventory` that wraps the locked invocation
  command.
- `wiki/SCHEMA.md` — **only** if Open Decision C locks C1 or C2;
  the reserved-file list or the entity-type enum gains the new
  entry per § Scope (In) D.
- `docs/ai/DECISIONS.md` — D-14501..D-14503 appended (or
  retargeted contiguous block per § F above).
- `docs/ai/work-packets/WORK_INDEX.md` — WP-145 row added at
  execution start; flipped to "completed" at end.

### NOT modified

- `scripts/architecture-inventory.mjs` — explicitly out of scope.
- `packages/**` — no engine, registry, preplan, or vue-sfc-loader
  changes.
- `apps/server/**` — no server changes.
- `apps/registry-viewer/**`, `apps/arena-client/**` — no changes.
- `wiki/SCHEMA.md` — **not modified** if Open Decision C locks
  C3 (out-of-wiki rendering). Schema is touched only under C1
  / C2.
- `apps/wiki-viewer/hugo.toml` — no determinism-knob changes;
  the integration must compose with the existing config.
- `data/**`, `docs/legendary-universal-rules-v23.md`, and any
  other content artifact unrelated to wiki / inventory pipelines.

---

## Acceptance Criteria

The list below is conditional on the locked option set. Items
prefixed with **(always)** apply to every combination.

### Inventory output reachability

- **(always)** `node scripts/architecture-inventory.mjs --out -`
  exits 0 from the repo root and emits a non-empty markdown
  document with the documented header (UTC date, script identity,
  category sections).
- **(always)** Two consecutive runs of the script with the same
  filesystem state and the same UTC date produce byte-identical
  output. (If the runs straddle midnight UTC, expect a one-line
  header diff; the body must be identical.)

### Wiki / site integration

- **(B1 / B3)** The locked output path exists under `wiki/` after
  execution; `git status` shows it as a tracked file.
- **(B2)** The locked output path exists under
  `apps/wiki-viewer/content/` after `pnpm wiki-viewer:build`;
  `git status` shows it as untracked / git-ignored.
- **(A2 / A3)** The relevant CI workflow runs to completion on
  a test trigger (push to a feature branch with the integration;
  or `workflow_dispatch` for cron-mode workflows).
- **(always)** The rendered Hugo site at the locked URL path
  surfaces the inventory output. (Verification step §6 below
  asserts the path is reachable.)

### Build determinism preserved

- **(always)** The existing `.github/workflows/wiki-viewer.yml`
  determinism check (two consecutive Hugo builds; byte-identical
  `*.html` + `*.css`) still passes after the integration. The
  check's hash output is recorded in the WP-145 commit message
  for traceability.
- **(A2 only)** The integration must not introduce a date-flip
  failure mode. Either Open Decision A is **not** A2, or the
  WP author has accepted the cross-midnight risk in writing
  (recorded in D-14501).

### Schema integrity

- **(C1 / C2)** `wiki/SCHEMA.md` is updated; the reserved-file
  list or entity-type enum reflects the locked option. The
  schema's flat-structure cap, lint targets, and existing
  entity-page contract are otherwise unchanged.
- **(C3)** `wiki/SCHEMA.md` is **unchanged**.

### Layer-boundary cleanliness

- **(always)** No new runtime imports of `game-engine`,
  `registry`, `preplan`, or `apps/server` introduced by this WP.
  `grep -rn "@legendary-arena/(game-engine|registry|preplan)"
  apps/wiki-viewer/ scripts/architecture-inventory.mjs` returns
  zero source matches.
- **(always)** No `boardgame.io` import added anywhere.

### Engine + viewer baselines unchanged

- **(always)** `pnpm --filter @legendary-arena/registry test` and
  `pnpm --filter @legendary-arena/game-engine test` exit 0 with
  baselines unchanged from pre-WP-145.
- **(always)** `pnpm --filter @legendary-arena/server test`
  exits 0 with baseline unchanged.

### DECISIONS

- **(always)** D-14501..D-14503 (or retargeted contiguous block)
  appended to `docs/ai/DECISIONS.md`.

### Documentation

- **(always)** `apps/wiki-viewer/README.md` documents the
  inventory invocation pattern with the locked path and cadence.
- **(always)** `docs/ai/work-packets/WORK_INDEX.md` lists WP-145
  with completion date and a one-line summary naming the
  locked options (e.g., "A3 + B1 + C1 + D1").

---

## Verification Steps

```pwsh
# Step 1 — inventory script runs deterministically (same execution window)
node scripts/architecture-inventory.mjs --out -
# Expected: exits 0; non-empty markdown stdout with UTC-date header.

node scripts/architecture-inventory.mjs --out tmp-inventory-1.md
Start-Sleep -Seconds 1
node scripts/architecture-inventory.mjs --out tmp-inventory-2.md
# why: this test assumes both invocations occur within the same UTC day.
# The script's header includes TODAY_UTC; a midnight-UTC straddle would
# produce a one-line header diff and trip Compare-Object falsely. If the
# test fires near midnight UTC, rerun outside the boundary.
$diff = Compare-Object (Get-Content tmp-inventory-1.md) (Get-Content tmp-inventory-2.md)
if ($diff) { throw "Inventory script is non-deterministic within same UTC window" }
Remove-Item tmp-inventory-1.md, tmp-inventory-2.md
# Expected: no throw.

# Step 2 — locked output path is populated (B1 / B2 / B3 specific)
# B1:
Test-Path wiki/architecture-inventory.md
# Expected: True.
# B2: ordering matters — inventory MUST run after projection so the
# generated file is not clobbered by the projection target's
# clear-and-recreate step in apps/wiki-viewer/scripts/project-wiki.mjs.
pnpm wiki-viewer:project
pnpm wiki-viewer:inventory
Test-Path apps/wiki-viewer/content/architecture-inventory.md
# Expected: True.
# B3:
Test-Path wiki/_generated/architecture-inventory.md
# Expected: True.

# Step 3 — Hugo build still green
pnpm --filter @legendary-arena/registry test
pnpm --filter @legendary-arena/game-engine test
pnpm --filter @legendary-arena/server test
# Expected: each exits 0; baselines UNCHANGED from pre-WP-145.

# Step 4 — wiki-viewer build still deterministic
cd apps/wiki-viewer
pnpm build
$first = (Get-ChildItem public -Recurse -Include *.html, *.css `
  | Sort-Object FullName `
  | ForEach-Object { (Get-FileHash $_.FullName).Hash }) -join "`n"
pnpm build
$second = (Get-ChildItem public -Recurse -Include *.html, *.css `
  | Sort-Object FullName `
  | ForEach-Object { (Get-FileHash $_.FullName).Hash }) -join "`n"
if ($first -ne $second) { throw "Wiki-viewer build is non-deterministic after WP-145 integration" }
cd ../..
# Expected: no throw.

# Step 5 — layer-boundary grep
Get-ChildItem -Path apps/wiki-viewer -Recurse `
  -Include *.toml, *.html, *.css, *.mjs, *.yml `
| Select-String -Pattern '@legendary-arena/(game-engine|registry|preplan)|apps/server'
Select-String -Path scripts/architecture-inventory.mjs `
  -Pattern '@legendary-arena/(game-engine|registry|preplan)|apps/server'
# Expected: no matches in either invocation.

# Step 6 — rendered URL reachability (post-deploy; manual or CI)
# Replace <locked-url> with the path locked in Open Decision B.
# Example for B1 + Hugo's pretty URLs: /architecture-inventory/
# A successful curl/HEAD against ewiki.legendary-arena.com/<locked-url>
# returns 200 OK.
# Expected: 200 OK.

# Step 7 — workflow run (A2 / A3 only)
# A2: push a feature branch and confirm wiki-viewer.yml runs the new
#     inventory step ahead of project-wiki, exits 0, and the resulting
#     deploy renders the inventory page.
# A3: trigger architecture-inventory.yml via workflow_dispatch (or wait
#     for cron). On a clean diff, expect no PR / commit; on a diff,
#     expect the locked diff policy (D1 / D2 / D3) to fire.
```

---

## Decisions

> **Decision numbering.** Highest landed `D-NNNN` on `main` at draft
> time is `D-13901` (WP-140). WP-144 is in-flight on a sibling
> worktree and claims `D-14401`. WP-145 therefore claims
> `D-14501..D-14503` (the next contiguous free block above WP-144).
> If WP-144 has landed before WP-145 executes, the claim is unchanged
> (D-14401 is consumed by WP-144 either way). If a sibling WP lands
> between WP-144 and WP-145 and consumes `D-14501..D-14503`, the
> executing agent retargets to the next free contiguous block and
> records the retargeting in the WP-145 session notes.

### D-14501 — Architecture inventory cadence

To be locked at execution per Open Decision A. The locked entry
states the chosen option (A1 / A2 / A3) with rationale, and — if
A=A3 — the locked cron expression and the diff policy from Open
Decision D.

### D-14502 — Architecture inventory output file location

To be locked at execution per Open Decision B. If B=B1, this entry
also amends D-13810 (the engineering-wiki reserved-file handling
decision) to permit a single generator-authored file under
`wiki/`, names the inventory script as that file's sole writer,
and forbids hand-edits. If B=B3, this entry amends D-13810 to
permit a `_generated/` subdirectory and is paired with the
SCHEMA.md amendment recorded under D-14503.

### D-14503 — Architecture inventory schema accommodation

To be locked at execution per Open Decision C. The locked entry
captures the SCHEMA.md amendment (if C=C1 or C=C2) or records
the no-amendment posture (if C=C3) with rationale.

---

## Vision Alignment

This WP aligns with [`docs/01-VISION.md`](../../01-VISION.md):

- **§15 Built for Contributors.** Surfacing the architecture
  inventory on the engineering wiki removes friction from
  contributor onboarding: a contributor who wants to know "what
  libraries does this monorepo actually use, and where" gets a
  rendered, searchable page instead of having to clone, install
  Node, and run a script. WP-139 already brought the wiki
  rendering surface; WP-145 brings one more useful artifact onto
  it.
- **§14 Explicit Decisions, No Silent Drift.** D-14501..D-14503
  lock the cadence, output location, and schema accommodation
  for the inventory's wiki integration; future changes require
  explicit superseding entries. The integration is *not* a
  silent extension of D-13810 — Open Decision B (B1 / B3)
  explicitly amends D-13810 if it routes the report under
  `wiki/`.
- **§7 Strict Layer Separation.** No runtime imports introduced;
  the script remains in `scripts/`, the viewer remains
  `docs-app` per D-13807. The integration is a build-time and
  CI-time wiring change, not a layer crossing.

No primary vision goal is at risk. No non-goal is approached.

---

## Funding Surface Gate

N/A — this WP touches no funding affordance, no global navigation,
no profile / account funding attribution surface, no tournament-
funding channel integration, and no user-visible copy referencing
donate / support / tournament-funding. The artifact is a CI / wiki
pipeline integration; the rendered output is an architecture
inventory page that names libraries and counts, no funding
affordance.

---

## API Catalog Update

N/A per D-11804 — this WP touches no `apps/server` HTTP endpoint,
registers no new route, modifies no existing endpoint's URL /
method / request shape / response shape / status codes / auth
posture, removes no endpoint, and adds no `apps/server/src/**`
library function recorded in the catalog as `Library-only`. The
change is confined to `scripts/`, `apps/wiki-viewer/`,
`.github/workflows/`, `wiki/`, and the governance ledgers.
`docs/ai/REFERENCE/api-endpoints.md` is not modified.

---

## Definition of Done

1. WP-145 row in `WORK_INDEX.md` flipped to **Done** with the
   executing commit hash and a one-line summary naming the locked
   options (e.g., "A3 + B1 + C1 + D1").
2. D-14501..D-14503 (or retargeted contiguous block) appended to
   `docs/ai/DECISIONS.md` in numeric order, each entry naming the
   locked option from § Open Decisions and the rationale.
3. The inventory page is reachable at the locked URL on
   `ewiki.legendary-arena.com/`. A `curl -I <url>` from the
   verification step returns 200.
4. Two consecutive `pnpm wiki-viewer:build` invocations still
   produce byte-identical `*.html` + `*.css` output (the WP-139
   determinism contract is preserved).
5. Engine + registry + server + registry-viewer test baselines
   UNCHANGED from pre-WP-145 (no test count regressions; no
   test count additions in those packages).
6. `scripts/architecture-inventory.mjs` is **byte-identical** to
   its pre-WP-145 contents (the script-immutability constraint).
7. If C=C1 or C=C2: `wiki/SCHEMA.md` reflects the locked schema
   amendment; the document's "Last updated" date is bumped to
   the execution date; the amendment is cited from D-14503.
8. If C=C3: `wiki/SCHEMA.md` is byte-identical to its pre-WP-145
   contents.
9. Lint gate (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`)
   passed at this packet's execution-session start.

---

## Pattern: Generated Artifacts in the Engineering Wiki

This WP implicitly establishes a reusable pattern for integrating
**generated, non-entity artifacts** into the engineering wiki
pipeline. The pattern is captured here so future WPs introducing
similar artifacts (drift reports, decision-coverage matrices,
test-baseline snapshots, badge files, etc.) can conform without
re-deriving the rules.

The pattern's invariants:

1. **Single-writer invariant.** A generated artifact has exactly
   one authoritative writer (a script in `scripts/`). Any
   committed copy of the artifact is governed by that writer; no
   hand-edits are authoritative.
2. **Deterministic generation.** The writer must produce
   byte-identical output across consecutive runs against the
   same filesystem state and the same time-of-day window. Any
   intentional time-dependence (e.g., a `TODAY_UTC` header) must
   be documented explicitly in the script header and must not
   trip the consuming pipeline's determinism checks.
3. **Explicit DECISIONS amendment when crossing the source
   boundary.** If the artifact lands under `wiki/` (or any other
   read-only-source location), the WP that introduces it must
   amend the relevant boundary-locking decision (here: D-13810)
   to name the file as the single permitted exception. Silent
   crossings are forbidden.
4. **Optional CI-driven refresh with diff gating.** When CI
   regenerates the artifact, the diff policy (PR vs direct
   commit vs auto-merge) must be locked in a DECISIONS entry
   alongside the cadence. Cron schedule must be explicit, not
   derived.
5. **Non-gating posture preserved.** The generator's failure
   must not block unrelated pipelines unless explicitly
   elevated in a future WP with its own DECISIONS amendment.
6. **Upgrade / deprecation posture.** Removing a generated
   artifact requires a sibling WP that (a) reverses the
   relevant DECISIONS amendment that named the file as a
   single-writer exception under the source-readonly rule,
   (b) deletes the artifact's file in the same commit, and
   (c) removes any SCHEMA reserved-file row added when the
   artifact landed. Replacement (e.g., a script-format change
   that produces a structurally different report) routes
   through a sibling WP that updates the script under its
   own immutability-rule waiver, then re-runs the generator
   at execution time. Hand-cleanup of generated artifacts is
   forbidden — any cleanup goes through the same single-
   writer + DECISIONS-amendment chain that created the
   artifact.

Future WPs introducing generated artifacts SHOULD conform to this
pattern. Deviations require their own DECISIONS entries and
should cite this section explicitly.

---

## Lint Gate Status (DRAFT — not yet invoked)

This WP is a **draft**. The Prompt Lint Gate
(`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) has not yet
been run against it. Items the WP author should verify before
execution:

- **§1 Structure** — required sections present (Goal, Assumes,
  Context, Scope, Out of Scope, Files Expected to Change,
  Acceptance Criteria, Verification Steps, Definition of Done): ✓
- **§2 Non-Negotiable Constraints Block** — present, with explicit
  flags on the option-(A2) determinism risk and the script-
  immutability rule: ✓
- **§3 Prerequisites (Assumes)** — explicit; this WP requires
  WP-139 on `main` (it is) and the inventory script on `main`
  (it is): ✓
- **§4 Context References** — concrete file paths cited; SCHEMA.md
  sections cited specifically: ✓
- **§5 Output Completeness** — Files Expected to Change is
  conditional on Open Decisions A / B / C / D and enumerates every
  combination's deltas. The Recommended Execution Profile
  (A3+B1+C1+D1) defines a concrete default subset; the
  Compatibility Matrix bounds valid alternatives. **If the
  executor accepts the recommended profile, §5 resolves
  immediately at session start; otherwise the executor must
  finalize the Open Decisions before formal lint pass.**
- **§6 Naming Consistency** — `wiki-viewer:inventory` script alias
  matches the existing `wiki-viewer:project` / `wiki-viewer:build`
  naming convention: ✓
- **§7 Dependency Discipline** — depends on WP-139 (landed),
  references inventory script (landed); WP-144 is independent and
  in-flight: ✓
- **§8 Architectural Boundaries** — non-negotiable constraints
  block lists explicit forbidden imports and the script-
  immutability rule: ✓
- **§9 Windows Compatibility** — Verification Steps use PowerShell
  syntax: ✓
- **§10 Env Var Hygiene** — N/A (no new env vars; the inventory
  script's `--out` flag is its only configuration surface and is
  set in scripts / workflows, not env)
- **§11 Authentication Clarity** — N/A (no auth surface;
  ewiki.legendary-arena.com is publicly readable)
- **§12 Test Quality** — smoke + determinism checks defined for
  every option combination; the script-determinism re-check
  guards against script regressions. The Verification Steps
  explicitly handle the UTC-day-straddle false-positive case in
  Step 1 and the projection-ordering hazard in Step 2 (B2 path).
  **Author must confirm these are sufficient before execution.**
- **§13 Commands and Verification** — present and PowerShell-
  formatted: ✓
- **§14 Acceptance Criteria Quality** — concrete and verifiable;
  conditional items are explicitly tagged with the option that
  triggers them: ✓
- **§15 Definition of Done** — explicit, with conditional
  schema-state assertions tied to Open Decision C: ✓
- **§16 Code Style** — applies during execution; no code authored
  at draft time. The integration is YAML / shell / minimal
  Markdown templates; § 16's human-style code rules apply
  primarily to the (A2/A3) workflow YAML (no clever shell, no
  unexplained flags) and the (C3) Hugo templates if locked.
- **§17 Vision Alignment** — present; §15, §14, §7 cited: ✓
- **§18 Prose-vs-Grep Discipline** — Verification Steps use
  greps where appropriate (layer-boundary check); prose is
  reserved for the conditional acceptance items: ✓
- **§19 Bridge-vs-HEAD Staleness** — Assumes block names the
  inventory script's commit (`7963c29`) and the WP-139 source-
  relocation commit (`feb4fdf`) as the load-bearing prior states: ✓
- **§20 Funding Surface Gate** — N/A (engineering wiki is
  internal; no funding surface introduced)
- **§21 API Catalog Update** — N/A (no HTTP endpoints added;
  static site only)

**Net status:** Draft passes structural lint (§1–§4, §6–§9,
§13–§15, §17–§19) at draft time. **§5 and §12 resolve cleanly
under the Recommended Execution Profile (A3+B1+C1+D1)**; if the
executor selects a non-default combination, those two items
require explicit lock before the formal Final Gate. §10, §11,
§16, §20, §21 are N/A or deferred-to-execution per their own
trigger conditions.
