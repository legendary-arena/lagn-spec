# WP-122 — Viewer Henchman flattenSet Emission Fix

**Status:** Draft (authored 2026-05-01; awaiting user review and lint-gate sign-off)
**Primary Layer:** Client UI (`apps/registry-viewer/`)
**Dependencies:**
- **Hard:** WP-003 (CardRegistry + `FlatCard` — the data shape rendered by the
  grid; not modified, but the new emission path produces values that satisfy it).
- **Hard:** WP-086 (Registry Viewer Card-Types Upgrade — established
  `apps/registry-viewer/src/registry/shared.test.ts` as the viewer-side
  `node:test` harness and the `tsx` runner; the new test added here is the
  second test block in that file).
- **Soft:** WP-094 (Viewer Hero FlatCard Key Uniqueness — direct structural
  precedent; same file, same divergent-from-`packages/registry` viewer-local
  copy of `flattenSet`, same single-file bug-fix scope).

---

## Session Context

WP-094 fixed a hero-side correctness bug in the viewer-local copy of
`flattenSet` at `apps/registry-viewer/src/registry/shared.ts`. The same
file harbors a second silent-zero-emission bug — this one in the
henchmen block. WP-086 (Card-Types Upgrade) made the bug user-visible
by introducing the taxonomy-driven ribbon: the `Henchman` pill now
appears for every viewer page load, but selecting it shows zero cards.

Investigation (2026-05-01) confirmed the cause: the henchman block
expects a nested `cards` sub-array per group, but the actual data
shape across all 40 sets in `data/cards/*.json` is a flat object
per henchman
(`{ id, name, slug, imageUrl, abilities, vAttack, vp }` — no
`cards` array).

As a result, the inner
`for (const card of hmCards)` loop iterates zero times for every
henchman group, silently dropping **all 44 henchmen** from emission.

This packet replaces the broken nested iteration with a flat
treatment that mirrors the bystanders/wounds blocks already present in
the same file, restoring 44 henchman FlatCards to the search index.

---

## Goal

After this session:

- `apps/registry-viewer/src/registry/shared.ts` emits exactly one
  `FlatCard` per henchman group in `set.henchmen`, with
  `cardType: "henchman"`.
- The `Henchman` ribbon pill on `cards.barefootbetters.com` shows the
  full set of henchman cards (44 across the production R2 data load),
  not zero.
- A new unit test in
  `apps/registry-viewer/src/registry/shared.test.ts` asserts that a
  henchman group with the real-data shape produces exactly one
  `FlatCard` with `cardType: "henchman"`. The test is wired through
  the existing `pnpm --filter registry-viewer test` runner introduced
  by WP-086.
- The `packages/registry/src/shared.ts` copy of `flattenSet` is
  **unchanged**. (That copy has no henchman block at all — it emits
  only hero / mastermind / villain / scheme cards — so no cross-layer
  surface is touched by this fix.)
- All other `flattenSet` blocks (heroes, masterminds, villains,
  schemes, bystanders, wounds, other) are unchanged.

---

## Assumes

- WP-003 complete: `FlatCard` type exists at
  `apps/registry-viewer/src/registry/types/` with the fields
  `key`, `cardType`, `setAbbr`, `setName`, `name`, `slug`, `imageUrl`,
  `abilities`.
- WP-086 complete:
  `apps/registry-viewer/src/registry/shared.test.ts` exists and is
  invoked by `pnpm --filter registry-viewer test`; the `tsx` devDep
  + `"test"` script in `apps/registry-viewer/package.json` are
  present.
- WP-094 complete: the viewer-local `flattenSet` is established as
  the divergent copy from `packages/registry/src/shared.ts` and is
  safe to modify in isolation.
- The data shape for henchman entries across all sets in
  `data/cards/*.json` is the flat object
  `{ id, name, slug, imageUrl, abilities, vAttack, vp }` — no nested
  `cards` array. Confirmed 2026-05-01 via a sweep of all 40 set
  files: 44 henchman entries, zero with a `cards` sub-array.
- `pnpm --filter registry-viewer build` exits 0 on `main` pre-session.
- `pnpm --filter registry-viewer typecheck` exits 0 on `main`
  pre-session.
- `pnpm --filter registry-viewer test` reports the WP-086 baseline
  (`22 / 4 / 0`) on `main` pre-session.

If any of the above is false, this packet is **BLOCKED** and must
not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  registry-viewer's allowed import surface; the fix stays entirely
  inside the Client UI layer and does not touch Registry, Engine, or
  Server.
- `.claude/rules/architecture.md §Layer Boundary` — runtime
  enforcement view of the same rules.
- `.claude/rules/registry.md §Critical Metadata Distinction` — the
  silent-failure mode for shape-mismatched data is a known viewer
  hazard; this fix follows the same diagnostic pattern (treat each
  group as a flat record, do not synthesize a sub-array that does
  not exist).
- `apps/registry-viewer/CLAUDE.md` — viewer architecture (Vue 3 +
  Vite 5 + Zod), single-page tab switching, R2 data source.
- `apps/registry-viewer/src/registry/shared.ts` — the file to be
  modified. Read the henchmen block (lines 78–99 at draft time) and
  the bystanders block (lines 116–130 at draft time) — the fix
  rewrites the henchmen block to follow the bystanders pattern.
- `apps/registry-viewer/src/registry/shared.test.ts` — the test file
  to be modified. Read the existing four-test structure; the new
  block is appended after the `Phase 1 ribbon zero-card invariants`
  describe.
- `packages/registry/src/shared.ts` — sibling `flattenSet` in the
  registry package. **Do not modify.** It does not iterate henchmen
  at all (only heroes / masterminds / villains / schemes); no
  cross-layer impact.
- `data/cards/core.json` — confirms the henchman shape: each entry
  has `{ id, name, slug, imageUrl, abilities, vAttack, vp }` and no
  `cards` sub-array. Used as the structural reference for the
  in-memory test fixture.
- `docs/ai/work-packets/WP-094-viewer-hero-flatcard-key-uniqueness.md`
  — direct structural precedent; same file, same divergent-from-
  `packages/registry` viewer-local copy, same single-file bug-fix
  scope.
- `docs/ai/work-packets/WP-086-registry-viewer-card-types-upgrade.md`
  — establishes the viewer test runner; cite for test-harness
  provenance.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations — full English variable names), Rule 6 (`// why:`
  comments), Rule 7 (no nested ternaries / no `.reduce()` for
  branching), Rule 11 (full-sentence error messages — N/A here, no
  errors thrown).
- `docs/ai/DECISIONS.md` — scan for any prior decision on
  `flattenSet` henchman shape or the `cards` sub-array assumption.
  None expected; D-12201 is the new entry.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ — all new and modified code uses `import`/
  `export`, never `require()`.
- `node:` prefix on all Node.js built-in imports (the test file
  already uses `node:test` and `node:assert`; preserved).
- Test files use `.test.ts` extension — never `.test.mjs`.
- No `Math.random()`, no `Date.now()`, no `performance.now()`, no
  `new Date(`. Not applicable in scope (the henchman block is pure
  data transformation; the test uses static fixtures).
- Full file contents required for every new or modified file —
  diffs, snippets, and partial output are forbidden.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (full
  English names, `// why:` comments where the reason is non-obvious,
  no `.reduce()` for branching logic).
- No new npm dependencies. `package.json` files are unchanged.

**Packet-specific:**
- **Sole production file modified:** `apps/registry-viewer/src/registry/shared.ts`.
- **Sole test file modified:** `apps/registry-viewer/src/registry/shared.test.ts`.
- **Henchmen block only.** The heroes, masterminds, villains,
  schemes, bystanders, wounds, and other blocks in the same file are
  not touched. No reformatting churn elsewhere in the file.
- **No `packages/registry` changes.** The engine has no consumer of
  henchman FlatCards (the engine consumes `MatchSetupConfig.henchmanGroupIds`
  via the registry layer, not via `FlatCard` records); even so, the
  registry-package copy of `flattenSet` does not iterate henchmen at
  all, so no cross-layer impact exists.
- **Key format change is purely additive.** The current
  implementation emits **zero** henchman `FlatCard` records;
  therefore no runtime consumer has ever observed or relied on a
  `${abbr}-henchman-*` key. Introducing
  `${abbr}-henchman-${slug}` cannot break compatibility because the
  prior keyspace was empty. The new emission uses the
  bystanders/wounds key shape (one segment after `henchman-`, not
  two).
- **Per-card `cardType` value remains `"henchman"`.** No new ribbon
  category, no Phase-2 slug emission. WP-086 Phase 2 (separate WP)
  remains the path for `sidekick` / `shield-agent` / `shield-officer`
  / `shield-trooper` emission.
- **No refactor or tidy-up.** Adjacent code paths are not modified.
  No comment churn outside the new `// why:` block on the rewritten
  henchmen iteration.
- **Test fixture matches real data exactly.** The new test's
  henchman fixture object uses the verbatim shape observed in
  `data/cards/core.json` (`{ id, name, slug, imageUrl, abilities }`
  at minimum; `vAttack` / `vp` may be omitted because `flattenSet`
  does not project them onto `FlatCard`).

**Required `// why:` comments:**
- A multi-line `// why:` block immediately above the rewritten
  henchmen `for (const henchman of set.henchmen)` loop, documenting:
  (a) the data-shape mismatch that caused the original silent-zero
  emission (no `cards` sub-array on henchman entries; bug verified
  2026-05-01 across all 40 sets — 44 henchman entries, zero with
  nested `cards`); (b) the parallel to bystanders/wounds, which use
  the same flat treatment in this same file; (c) the divergence
  from `packages/registry/src/shared.ts`, which does not iterate
  henchmen at all and therefore needs no parallel fix; (d) the
  citation `D-12201` for the locked decision; (e) the scope
  reference `WP-122 / EC-123`; (f) why the fix emits **one
  `FlatCard` per henchman group** rather than synthesizing a
  per-card expansion — `FlatCard` is the registry-display
  projection (one record per registry entry), not a deck
  realization. In Legendary, a henchman group does enter the
  villain deck as 10 copies, but that expansion is an engine-layer
  concern (`packages/game-engine/**`); at the viewer's `flattenSet`
  layer, each group is one atomic record; (g) why the fix
  intentionally surfaces only the flat `imageUrl` field and ignores
  `imageUrlByClass`. The shape sweep at WP-122 pre-flight
  (2026-05-01) found that some henchmen carry both a flat
  `imageUrl` *and* an `imageUrlByClass` object keyed by hero class
  (`covert | instinct | ranged | strength | tech`) with a
  class-specific image URL each — confirmed examples
  `amwp/tardigrade` and `wtif/ultron-sentries`. The current
  `FlatCard` schema models only `imageUrl: string` and has no
  field for class-specific art. Surfacing the class-keyed map
  would require widening `FlatCard` plus paired UI changes in
  `CardGrid.vue` / `CardDetail.vue` to render the class variant —
  out of scope for this WP. A future WP that widens `FlatCard` to
  expose hero-class-specific henchman art is the right place for
  that work; this fix preserves the flat-`imageUrl` projection
  contract used by every other card-type block in this same file.

**Session protocol:**
- If any of the following arises, STOP and ASK before proceeding:
  - A henchman entry is encountered with a `cards` sub-array
    (would invalidate the unconditional flat treatment — escalate
    to a Phase-1.5 conditional path, not in scope here).
  - The new key shape collides with another `FlatCard.key` value
    elsewhere in the loaded sets (would imply a slug-uniqueness
    failure in upstream data — separate WP).
  - The `shared.test.ts` baseline `22 / 4 / 0` does not hold at
    session start (would imply the WP-086 harness regressed —
    investigate before adding any new test).
  Do not "helpfully" extend scope.

**Locked contract values (inline — do not paraphrase or re-derive):**

- **Henchman key format (verbatim):** `` `${abbr}-henchman-${slug}` ``
  (one segment after `henchman-`, not two — matches the
  bystanders/wounds shape in the same file).
- **Per-card cardType (verbatim):** `"henchman"` (string literal,
  not `CardType.Henchman` or any constant import — this matches the
  prevailing pattern in the same file).
- **Loop variable name (verbatim):** `henchman` (not `h` or `hench`
  — full English per 00.6 Rule 4; the locally-narrowed `Record<…>`
  alias inside the loop is named `henchmanRecord`, not `hm`).
- **Slug fallback chain (verbatim):**
  `String(henchmanRecord["slug"] ?? henchmanRecord["name"] ?? "henchman")`
  — matches the bystanders/wounds fallback shape exactly.
- **Test describe block title (verbatim):**
  `"flattenSet henchman emission (WP-122)"`.

---

## Vision Alignment

**Vision clauses touched:** §10a (Registry Viewer public surface —
search and browse quality on `cards.barefootbetters.com`).

**Conflict assertion:** No conflict. This WP restores intended
search behavior for the `Henchman` ribbon pill on the public
reference surface; it adds no monetization, no persuasive surface,
no competitive ranking implication.

**Non-Goal proximity check:** None of NG-1..NG-7 is crossed. This is
a bug fix on free public reference tooling.

**Determinism preservation:** N/A — no scoring, replay, RNG, or
simulation surfaces are touched. `flattenSet` is a pure
data-transformation helper; the fix changes only which records it
emits, not the order or the contents of any RNG-driven path.

---

## Funding Surface Gate

**§20 — N/A.** This WP touches no §20.1 trigger surface: no global
nav funding affordance, no registry-viewer funding affordance, no
profile-level funding attribution, no tournament-funding integration,
and no user-visible copy referencing donate / support / tournament
funding. The ribbon pill labels (`Henchman`, etc.) and the search
grid are pre-existing UI elements; this WP does not introduce or
modify any user-visible copy. Justification per §20.1 N/A
discipline: "registry-viewer correctness fix; no UI surfaces added,
no user-visible copy added, no funding channels referenced."

---

## §21 API Catalog — N/A

This WP touches no §21.1 trigger surface: no HTTP endpoint added,
modified, removed, or status-changed in `apps/server`; no
`apps/server/src/**` library function added or modified.
Justification per §21.4: "viewer-only correctness fix; no
`apps/server` files touched, no HTTP surface affected."

---

## Debuggability & Diagnostics

This packet is data-transformation-only and introduces no game state,
no RNG, and no mutation of `G` / `ctx`. The applicable subset of the
template's diagnostics clauses:

- **Deterministic reproduction:** `flattenSet` is a pure function of
  its `(set, setName)` inputs. Identical input set + identical name
  = identical `FlatCard[]` output.
- **External observability:** the new emission is visible in the
  card grid (44 henchman cards appear when the ribbon pill is
  active) and in the diagnostic panel's `totalCards` count
  (`HealthPanel.vue`'s `summary.totalCards` increases by the
  henchman count of every loaded set).
- **State mutation surface:** none. `flattenSet` returns a new
  array; it does not mutate the input set or any module-scoped
  state.
- **Failure localization:** any visible regression in henchman
  emission must trace to the rewritten loop in `shared.ts`; if it
  does not, the packet's scope was violated.
- **`G.messages` usage:** N/A — this packet does not touch `G`.

---

## Scope (In)

### A) `apps/registry-viewer/src/registry/shared.ts` — modified

- Replace the existing henchmen block (the `for (const h of set.henchmen) { … }`
  loop currently spanning ≈ lines 78–99 at draft time, including the
  inner `for (const card of hmCards)` iteration) with a flat
  treatment that mirrors the bystanders block already present at
  ≈ lines 116–130:
  - Iterate `for (const henchman of set.henchmen)`.
  - Skip non-object / null entries with a `continue`.
  - Narrow each entry to `Record<string, unknown>` aliased as
    `henchmanRecord`.
  - Compute `slug` via `String(henchmanRecord["slug"] ??
    henchmanRecord["name"] ?? "henchman")`.
  - Push exactly one `FlatCard` with `key:
    \`${abbr}-henchman-${slug}\``, `cardType: "henchman"`,
    `setAbbr: abbr`, `setName`, `name`, `slug`, `imageUrl`, and
    `abilities` populated from the henchman record.
- Add the multi-line `// why:` block defined under
  §Required `// why:` comments immediately above the new
  `for (const henchman of set.henchmen)` loop.
- All other blocks in the file (heroes, masterminds, villains,
  schemes, bystanders, wounds, other), the `applyQuery` function,
  and the `buildHealthReport` function are **unchanged**.

### B) `apps/registry-viewer/src/registry/shared.test.ts` — modified

- Append a new `describe("flattenSet henchman emission (WP-122)", …)`
  block after the existing `describe("Phase 1 ribbon zero-card
  invariants (WP-086)", …)` block.
- Import `flattenSet` from `./shared.js` (the existing file already
  imports `applyQuery`; add a sibling named import).
- Import the existing `SetData` type from
  `./types/types-index.js` to type the in-memory fixture; if a
  narrower public alias is more idiomatic, use the alias —
  consistency with the existing imports wins.
- Add at least the following test cases (minimum count is
  three; additional cases are permitted and one is recommended —
  see optional fourth case below):
  - **`emits exactly one FlatCard per henchman group with the
    real-data shape`** — given a `SetData` with one henchman
    entry shaped `{ id: 1, name: "Doombot Legion", slug:
    "doombot-legion", imageUrl: "...", abilities: [] }` (and
    empty arrays for every other category), assert that
    `flattenSet(setData, "Core Set").length === 1`, that the
    single result has `cardType === "henchman"`, that
    `slug === "doombot-legion"`, that `key === "core-henchman-doombot-legion"`,
    and that `setAbbr === "core"`.
  - **`emits zero FlatCards when set.henchmen is empty`** —
    asserts the regression baseline that an empty array produces
    no henchman emission.
  - **`falls back through name → "henchman" when slug is
    absent`** — given a henchman entry with no `slug` field,
    assert that the emitted FlatCard's `slug` and `key` derive
    from `name`; given an entry with neither `slug` nor `name`,
    assert the literal fallback `"henchman"` is used. This guards
    the `String(henchmanRecord["slug"] ?? henchmanRecord["name"]
    ?? "henchman")` chain explicitly.
  - **(Recommended optional fourth case)** **`surfaces flat
    imageUrl and ignores imageUrlByClass when both are
    present`** — given a henchman entry that carries both a flat
    `imageUrl` and an `imageUrlByClass` object (e.g.,
    `{ id: 1, name: "Tardigrade", slug: "tardigrade", imageUrl:
    "https://images.barefootbetters.com/amwp/amwp-hm-tardigrade.webp",
    imageUrlByClass: { covert: "...", instinct: "...", ranged:
    "...", strength: "...", tech: "..." }, abilities: [] }`),
    assert that the emitted `FlatCard.imageUrl` equals the flat
    `imageUrl` value verbatim and that no class-keyed value
    leaks into the projection. Pins the projection contract by
    test (not just by `// why:` comment), preventing a future
    maintainer from "fixing" the henchman emission to use the
    class-keyed map and silently breaking the `FlatCard`
    contract. Source for the real-data shape: `data/cards/amwp.json`
    and `data/cards/wtif.json` (verified at WP-122 pre-flight
    2026-05-01).
- Each new test uses `node:test` (`describe` / `it`) and
  `node:assert` `strict` only — no Jest, no Vitest, no Mocha. The
  existing test file already imports both; reuse those imports.

---

## Out of Scope

- **No changes to `packages/registry/**`.** The package-level
  `flattenSet` does not iterate henchmen and is not affected by
  this bug.
- **No changes to upstream card data under `data/cards/**`.** The
  henchman shape (flat objects without a nested `cards` array) is
  the established upstream shape; this WP adapts the viewer's
  `flattenSet` to match the data, not the other way around.
- **No upstream pipeline changes in `bbcode/modern-master-strike`.**
  Out of scope and out of repository.
- **No Phase-2 emission of `sidekick`, `shield-agent`,
  `shield-officer`, `shield-trooper`, or `other`.** Those slugs
  remain unemitted and therefore the `Sidekick`, `S.H.I.E.L.D.`,
  and `Other` ribbon pills remain empty after this WP. WP-086
  Phase 2 (separate WP) is the path for those slugs.
- **No CardGrid.vue / App.vue / CardDetail.vue changes.** The
  ribbon pill, search grid, and detail panel already render
  `cardType === "henchman"` correctly — the bug is upstream of
  them, in `flattenSet`.
- **No HealthPanel.vue changes.** The `totalCards` summary will
  increase by the henchman count of every loaded set as a natural
  consequence of the fix; no display change is needed.
- **No new ribbon pill or filter behavior.** The existing
  `Henchman` pill in `card-types.json` (added under WP-086) is
  what surfaces the fix; no UI work is in scope here.
- **No new npm dependency or package.json change.** The fix uses
  only existing imports.
- **No schema change** at `apps/registry-viewer/src/registry/schema.ts`
  or `packages/registry/src/schema.ts`. The henchman input is
  already typed `z.array(z.unknown())` in the viewer's
  `SetDataSchema` (line 110 at draft time), so no schema-level
  narrowing is needed and none is in scope.
- **No `applyQuery` or `buildHealthReport` changes.** Both
  functions are correct and consume whatever `flattenSet` emits.

---

## Files Expected to Change

- `apps/registry-viewer/src/registry/shared.ts` — **modified** —
  henchmen block rewritten to flat treatment mirroring
  bystanders/wounds; emits one FlatCard per henchman group with
  `cardType: "henchman"`.
- `apps/registry-viewer/src/registry/shared.test.ts` — **modified** —
  new `describe("flattenSet henchman emission (WP-122)", …)` block
  with at least three test cases.
- `docs/ai/work-packets/WP-122-viewer-henchman-flattenset-emission-fix.md` —
  **new** — this file.
- `docs/ai/execution-checklists/EC-123-viewer-henchman-flattenset-emission-fix.checklist.md` —
  **new** — companion EC (drafted in a follow-up authoring step;
  the EC number `EC-123` is reserved here because EC-122 is
  already taken by WP-121's checklist per the EC numbering
  precedent).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — adds the
  WP-122 row.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — adds
  the EC-123 row.
- `docs/ai/DECISIONS.md` — **modified** — adds D-12201 (locked key
  format, locked test minimum, scope-divergence rationale from
  `packages/registry/src/shared.ts`).
- `docs/ai/STATUS.md` — **modified** — adds the WP-122 execution
  entry at the top of `## Current State`.

---

## Acceptance Criteria

- [ ] `apps/registry-viewer/src/registry/shared.ts` contains a
      `for (const henchman of set.henchmen)` loop that pushes
      exactly one `FlatCard` per non-null henchman entry, with
      `cardType: "henchman"` and `key:
      \`${abbr}-henchman-${slug}\``.
- [ ] No `for (const card of hmCards)` (or any equivalent inner
      iteration over a `cards` sub-array) remains in the henchmen
      block of `shared.ts`.
- [ ] A multi-line `// why:` block immediately precedes the
      henchmen loop, satisfying every clause of §Required `// why:`
      comments above (data-shape mismatch citation, parallel to
      bystanders/wounds, divergence from `packages/registry`,
      D-12201 + WP-122 / EC-123 references).
- [ ] `apps/registry-viewer/src/registry/shared.test.ts` contains a
      `describe("flattenSet henchman emission (WP-122)", …)` block
      with at least three `it(…)` cases covering: single-group
      emission, empty-array regression baseline, and the
      slug/name/literal fallback chain.
- [ ] `packages/registry/src/shared.ts` is **unchanged** (verified
      via `git diff packages/registry/src/shared.ts` → no output).
- [ ] No file outside §Files Expected to Change is modified
      (verified via `git diff --name-only` → only the listed files
      appear).
- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter registry-viewer typecheck` exits 0.
- [ ] `pnpm --filter registry-viewer test` reports a **new
      expected baseline** of `(22 + N) / (4 + 1) / 0`, where
      `N ≥ 3` is the number of new `it` cases introduced by this
      WP. Zero failures.
- [ ] Manual smoke on `pnpm --filter registry-viewer dev`: clicking
      the `Henchman` ribbon pill produces a non-empty card grid
      (≥ 44 henchman cards visible across all eagerly-loaded sets;
      exact count depends on `registry-config.json` `eagerLoad`).
- [ ] No Vue console warnings about duplicate `v-for` keys
      introduced by the new emission (each `${abbr}-henchman-${slug}`
      key is unique per set).

---

## Verification Steps

```pwsh
# 1. Build + typecheck the viewer
pnpm --filter registry-viewer build
pnpm --filter registry-viewer typecheck

# 2. Run the viewer test suite — confirm new baseline
pnpm --filter registry-viewer test
# Expected: minimum 25 / 5 / 0 (was 22 / 4 / 0 pre-WP-122).

# 3. Confirm packages/registry is untouched
git diff packages/registry/src/shared.ts
# Expected: no output.

# 4. Confirm scope
git diff --name-only
# Expected: only the files listed in §Files Expected to Change.

# 5. Confirm the henchman block was rewritten (not patched in place)
Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "for \(const card of hmCards\)"
# Expected: zero matches.
Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "for \(const henchman of set\.henchmen\)"
# Expected: exactly one match.

# 6. Manual smoke
# Terminal: pnpm --filter registry-viewer dev
# Open http://localhost:5173
#   1. Click the Henchman ribbon pill — confirm a non-empty card grid.
#   2. Confirm the count chip ("N cards") shows ≥ 44.
#   3. Open the browser DevTools console — confirm no "Duplicate keys
#      detected" Vue warning on initial render or on filter toggle.
#   4. Toggle Henchman off (click again) — confirm the grid restores
#      to the unfiltered count.
#   5. Toggle to image view and data view — confirm both render
#      henchman tiles without console errors.
```

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] All Verification Steps pass.
- [ ] `git diff --name-only` shows only the files in §Files
      Expected to Change.
- [ ] D-12201 added to `docs/ai/DECISIONS.md` (locked key format,
      locked test minimum, scope-divergence rationale from
      `packages/registry/src/shared.ts`).
- [ ] `docs/ai/STATUS.md` updated with the WP-122 execution entry.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-122 row checked off
      with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-123 row set to
      `Done <date>`.
- [ ] No new npm dependencies added; `package.json` files
      unchanged across all workspaces.
- [ ] Commit prefix `EC-123:` per
      `docs/ai/REFERENCE/01.3-commit-hygiene-under-ec-mode.md`.
- [ ] Manual smoke on `cards.barefootbetters.com` (or local dev
      server) confirms the `Henchman` ribbon pill is no longer
      empty.

---

## Lint-Gate Self-Review (per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`)

| §  | Topic                          | Disposition |
|----|--------------------------------|-------------|
| 1  | WP structure                   | PASS — all required sections present. |
| 2  | Non-Negotiable Constraints     | PASS — engine-wide block intact; packet-specific block names sole files modified, locked contract values inline, session-protocol stop-and-ask clauses, required `// why:` comments. References `00.6-code-style.md`. Forbids partial output. |
| 3  | `## Assumes`                   | PASS — lists WP-003, WP-086, WP-094 deps + file-shape assumption + pre-session build/typecheck/test baselines. |
| 4  | `## Context (Read First)`      | PASS — specific files cited with line ranges where relevant; ARCHITECTURE.md §Layer Boundary cited; `00.6-code-style.md` cited; DECISIONS.md scan instruction included. |
| 5  | `## Files Expected to Change`  | PASS — eight files listed (two production, two governance, four ledger), each with `— new` / `— modified` and a one-line description. Bounded (≤ 8 cap respected). |
| 6  | Naming consistency             | PASS — `cardType: "henchman"` matches the existing literal in the same file; field names match `00.2-data-requirements.md`. No abbreviations. |
| 7  | Dependency discipline          | PASS — no new npm dependency. Forbidden packages not introduced. |
| 8  | Architectural boundaries       | PASS — viewer-only fix; layer boundary preserved (no `game-engine`, `preplan`, `server`, `pg`, or `boardgame.io` imports added). |
| 9  | Windows compatibility          | PASS — Verification Steps use `pwsh`-style `Select-String`; paths use `\` separators in shell snippets. |
| 10 | Environment variable hygiene   | N/A — no env vars added or referenced. Justification: viewer correctness fix; data is fetched via existing R2 config, no new env required. |
| 11 | Authentication clarity         | N/A — no auth surface touched. Justification: viewer correctness fix; no JWT, no session, no protected endpoint. |
| 12 | Test quality                   | PASS — new tests use `node:test` + `node:assert` strict only; no boardgame.io import; no network/DB access; deterministic in-memory fixtures. |
| 13 | Commands and verification      | PASS — every Verification Step is exact `pnpm` invocation with expected output. |
| 14 | Acceptance criteria quality    | PASS — 11 binary, observable, specific items (within the 6–12 cap). |
| 15 | Definition of Done             | PASS — includes STATUS.md, DECISIONS.md, WORK_INDEX.md, EC_INDEX.md, and scope-boundary checks. |
| 16 | Code style                     | PASS — full English names (`henchman`, `henchmanRecord`); JSDoc preserved on existing exports; comments explain WHY; no `.reduce()`; no `import *`; no terse error messages (no errors thrown in scope). |
| 17 | Vision Alignment               | PASS — §10a (Registry Viewer) cited; no NG-1..NG-7 crossed; determinism N/A with explicit justification. |
| 18 | Prose-vs-grep discipline       | N/A — no Verification Step uses a literal-string-scoped grep over forbidden tokens (`Math.random`, etc.). The two `Select-String` greps target newly-rewritten code paths, not forbidden tokens. Justification: greps target intended new code, not forbidden imports/calls. |
| 19 | Bridge-vs-HEAD staleness       | N/A — this WP is not a repo-state-summarizing artifact (no commit-history snapshot, no "Recent commits" enumeration, no STATUS-block draft). Reconciliation discipline applies at execution-commit time per the standard process, not at draft time. |
| 20 | Funding Surface Gate           | N/A — explicit one-line justification provided in §Funding Surface Gate above ("registry-viewer correctness fix; no UI surfaces added, no user-visible copy added, no funding channels referenced"). |
| 21 | API Catalog Update             | N/A — explicit justification provided in §§21 API Catalog above ("viewer-only correctness fix; no `apps/server` files touched, no HTTP surface affected"). |

**Final gate:** PASS. Ready for user review and execution scheduling.
