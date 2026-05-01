# EC-123 — Viewer Henchman flattenSet Emission Fix (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-122-viewer-henchman-flattenset-emission-fix.md`
**Layer:** Client UI (`apps/registry-viewer/`)

> **Numbering note:** EC-123 is the next free EC slot after EC-122 was
> claimed by WP-121's card zoom slider (per the EC-122 provenance
> breadcrumb). WP-122 and EC-123 are intentionally off-by-one — this is
> consistent with the locked precedent (EC-103 → EC-111, EC-101 →
> EC-114, EC-109 → EC-115, EC-121 → EC-122). The WP number (WP-122) is
> unchanged.

## §0 — Scope Model (Read Once)

This EC enforces **two distinct scopes**. They are not the same; do not
conflate them.

### A) Runtime / implementation scope (STRICT — 2 files)

Only these two code files under `apps/` may change:

1. `apps/registry-viewer/src/registry/shared.ts`
2. `apps/registry-viewer/src/registry/shared.test.ts`

Any other change under `apps/`, `packages/`, or `data/` is a **hard
abort** (see §Session Abort Conditions A).

### B) Total staged set (8 files at session close)

This execution closes WP-122 and records EC-123, so doc/ledger files
are also staged. The complete `git diff --name-only` output at session
end is expected to be exactly these **8** files — no more, no less:

1. `apps/registry-viewer/src/registry/shared.ts`
2. `apps/registry-viewer/src/registry/shared.test.ts`
3. `docs/ai/work-packets/WP-122-viewer-henchman-flattenset-emission-fix.md`
4. `docs/ai/execution-checklists/EC-123-viewer-henchman-flattenset-emission-fix.checklist.md`
5. `docs/ai/work-packets/WORK_INDEX.md`
6. `docs/ai/execution-checklists/EC_INDEX.md`
7. `docs/ai/DECISIONS.md`
8. `docs/ai/STATUS.md`

A 9th file under `apps/`, `packages/`, or `data/` is a runtime-scope
violation (§Session Abort Conditions A). A 9th file under `docs/`
(beyond the 6 ledger/doc files above) is a doc-scope violation
(§Session Abort Conditions A).

---

## Before Starting

> **STOP** if any checkbox below is false.

- [ ] WP-003 merged: `FlatCard` type and `flattenSet` helper exist in
      `apps/registry-viewer/src/registry/shared.ts`.
- [ ] WP-086 merged: `apps/registry-viewer/src/registry/shared.test.ts`
      exists with the existing `Phase 1 ribbon zero-card invariants
      (WP-086)` describe block; `apps/registry-viewer/package.json`
      `scripts.test` reads `node --import tsx --test src/**/*.test.ts`
      and `devDependencies.tsx` is `^4.15.7`.
- [ ] WP-094 merged: `apps/registry-viewer/src/registry/shared.ts`
      hero-key line reads `key: \`${abbr}-hero-${hero.slug}-${card.slug}\`,`
      (the WP-094 viewer-local divergence from `packages/registry/src/shared.ts`).
- [ ] Baseline captured: `pnpm --filter registry-viewer build`,
      `pnpm --filter registry-viewer typecheck`, and
      `pnpm --filter registry-viewer test` all exit 0 on `main` with
      the test runner reporting `tests 22 / suites 4 / pass 22 / fail 0`.
- [ ] `packages/registry/src/shared.ts` does **not** iterate
      `set.henchmen` (verified at HEAD via grep — only `"hero"`,
      `"mastermind"`, `"villain"`, `"scheme"` cardType literals
      appear). If a parallel session has added a henchmen block to
      `packages/registry/src/shared.ts`, STOP and re-read WP-122.
- [ ] `data/cards/*.json` henchman shape verified — 40 set files, 44
      henchman entries, **0 with a nested `cards` sub-array, 44 flat**
      (verified at WP-122 pre-flight 2026-05-01). If upstream has
      changed the shape (added a `cards` sub-array to any henchman
      entry), STOP and re-read WP-122.
- [ ] No parallel session is editing
      `apps/registry-viewer/src/registry/shared.ts` or
      `apps/registry-viewer/src/registry/shared.test.ts`.

## Session Abort Conditions

Immediately ABORT (do not continue coding) if any condition below is
observed during execution.

### A) Scope violations (mechanical — checkable via `git diff --name-only`)

- Any edit is proposed to `packages/registry/src/shared.ts`, any file
  under `packages/registry/**`, `packages/game-engine/**`,
  `packages/preplan/**`, `apps/server/**`, or `apps/arena-client/**`.
- Any edit is proposed under `data/**`.
- Any `.vue` file is edited (consumer migration is explicitly out of
  scope).
- Any additional file under `apps/`, `packages/`, or `data/` appears
  in `git diff --name-only` beyond the two viewer files permitted in
  §0(A).
- Any additional doc file appears in `git diff --name-only` beyond
  the six ledger/doc files in §0(B) (positions 3–8).

### B) Semantic violations

- The fix is applied to a card-type block other than **henchmen**
  (heroes, masterminds, villains, schemes, bystanders, wounds, other
  must remain byte-identical pre- and post-execution).
- The henchmen block adds a per-card inner iteration that
  re-introduces the `cards` sub-array assumption (e.g., a
  `for (const card of …)` inside the henchman loop) — the fix is
  exclusively flat treatment.
- The cardType literal is changed from `"henchman"` to any other
  value (e.g., `"sidekick"`, `"shield-agent"`, etc.) — Phase-2
  emission is out of scope per WP-086 Phase 2 (separate WP).
- The `FlatCard` type is widened to include `imageUrlByClass`,
  `vAttack`, or `vp` — `FlatCard` schema changes are out of scope.
- `applyQuery` or `buildHealthReport` in `shared.ts` is modified.
- Any refactor, rename, or formatting churn is proposed outside the
  henchmen block in `shared.ts` or the new `flattenSet henchman
  emission (WP-122)` describe block in `shared.test.ts`.

## Locked Values (do not re-derive)

- **Production file modified (verbatim):**
  `apps/registry-viewer/src/registry/shared.ts`
- **Test file modified (verbatim):**
  `apps/registry-viewer/src/registry/shared.test.ts`
- **Henchman key format (verbatim):** `` `${abbr}-henchman-${slug}` ``
  — one segment after `henchman-`, matching the bystanders/wounds
  shape in the same file.
- **Per-card cardType (verbatim):** `"henchman"` (string literal,
  not a constant import — matches the prevailing pattern in this
  same file).
- **Loop variable name (verbatim):** `henchman` (full English; no
  abbreviation).
- **Narrowed-record alias (verbatim):** `henchmanRecord` (full
  English; not `hm` or `h`).
- **Slug fallback chain (verbatim):**
  `String(henchmanRecord["slug"] ?? henchmanRecord["name"] ?? "henchman")`
  — matches the bystanders/wounds fallback shape exactly.
- **Test describe block title (verbatim):**
  `"flattenSet henchman emission (WP-122)"`.
- **Pre-session test baseline:** `tests 22 / suites 4 / pass 22 /
  fail 0`.
- **Expected post-session test baseline:** `(22 + N) / (4 + 1) / 0`
  where `N ≥ 3` (minimum three new `it` cases; a fourth optional
  case is recommended — see §Required Test Cases).
- **Real-data shapes for fixtures (verbatim from observed data):**
  - Standard flat henchman (e.g., `data/cards/core.json` Doombot
    Legion): `{ id, name, slug, imageUrl, abilities, vAttack?, vp? }`.
  - Class-keyed henchman (e.g., `data/cards/amwp.json` Tardigrade,
    `data/cards/wtif.json` Ultron Sentries): `{ id, name, slug,
    imageUrl, imageUrlByClass: { covert, instinct, ranged, strength,
    tech }, abilities, vAttack?, vp? }`.

## Guardrails

- **Two-file production+test scope.** Only
  `apps/registry-viewer/src/registry/shared.ts` (production) and
  `apps/registry-viewer/src/registry/shared.test.ts` (test) are
  edited. Any other file outside that pair (governance ledgers
  excluded — see §0) is a scope violation.
- **Stage by exact file path only.** Never use `git add .`,
  `git add -A`, or `git add -u`. The repo currently has at least one
  unrelated untracked file
  (`docs/ai/execution-checklists/EC-119-public-leaderboard-http-endpoints.checklist.md`,
  observed at WP-122 pre-flight 2026-05-01) that an over-eager
  blanket-add would pull into this commit. Always pass each path
  explicitly to `git add`. The 8-file expected staged set in §0(B) is
  the sole authority on what may be staged.
- **Henchmen block only.** The change applies to the henchmen loop
  exactly once; no other card-type block is modified.
- **Replace, do not patch.** The existing `for (const h of
  set.henchmen)` loop with its inner `for (const card of hmCards)`
  is replaced wholesale by the flat treatment. No leftover `hmCards`
  variable, no leftover inner loop, no commented-out dead code.
- **No packages/registry edits.** The packages-side `flattenSet`
  does not iterate henchmen at all and needs no parallel fix.
- **No consumer migration.** `CardGrid.vue`, `CardDetail.vue`,
  `App.vue`, `HealthPanel.vue`, and every other `.vue` file in
  `apps/registry-viewer/` require no change; they consume
  `card.cardType === "henchman"` and `card.key` opaquely.
- **No new dependencies.** No `package.json` changes in any
  workspace.
- **No schema change.** `apps/registry-viewer/src/registry/schema.ts`
  and `packages/registry/src/schema.ts` are not modified — both
  already model `henchmen` as `z.array(z.unknown())`.
- **No FlatCard widening.** `FlatCard.imageUrl: string` remains the
  only image field on the projection; `imageUrlByClass` is not
  surfaced (a future WP that widens `FlatCard` is the right place
  for class-keyed art).
- **No refactor of bystanders / wounds / other / hero / villain /
  mastermind / scheme blocks.** They are byte-identical pre- and
  post-execution.
- **No `// why:` churn elsewhere in the file.** The required
  `// why:` block is added immediately above the rewritten henchmen
  loop and nowhere else.
- **No test runner config change.** `apps/registry-viewer/package.json`
  is not modified (the runner is already wired by WP-086).

## Required `// why:` Comments

A multi-line `// why:` block must sit immediately above the new
`for (const henchman of set.henchmen)` loop in
`apps/registry-viewer/src/registry/shared.ts`, documenting all
**seven** clauses (a)–(g) verbatim from WP-122 §Required `// why:`
comments:

- **(a)** Data-shape mismatch citation: no `cards` sub-array on
  henchman entries; bug verified 2026-05-01 across all 40 sets — 44
  henchman entries, zero with nested `cards`.
- **(b)** Parallel to bystanders/wounds, which use the same flat
  treatment in this same file.
- **(c)** Divergence from `packages/registry/src/shared.ts`, which
  does not iterate henchmen at all and therefore needs no parallel
  fix.
- **(d)** Citation `D-12201` for the locked decision.
- **(e)** Scope reference `WP-122 / EC-123`.
- **(f)** Why the fix emits one `FlatCard` per henchman group rather
  than synthesizing a per-card expansion — `FlatCard` is the
  registry-display projection (one record per registry entry), not
  a deck realization. Engine-layer deck expansion (10 copies in the
  villain deck) lives in `packages/game-engine/**`.
- **(g)** Why `imageUrlByClass` is intentionally not surfaced — some
  henchmen carry both a flat `imageUrl` and a class-keyed
  `imageUrlByClass` map (e.g., `amwp/tardigrade`,
  `wtif/ultron-sentries`); `FlatCard` schema models only flat
  `imageUrl`; surfacing the class-keyed map requires `FlatCard`
  widening + paired UI changes (separate future WP).

If the `// why:` block omits any of (a)–(g), the EC fails and the
session must re-attempt with the missing clause added.

## Required Test Cases

The new `describe("flattenSet henchman emission (WP-122)", ...)`
block in `apps/registry-viewer/src/registry/shared.test.ts` must
contain at least three `it` cases (minimum count locked); a fourth
case is recommended.

**Mandatory cases (3):**

1. **`emits exactly one FlatCard per henchman group with the
   real-data shape`** — fixture `SetData` with one henchman entry
   shaped `{ id: 1, name: "Doombot Legion", slug:
   "doombot-legion", imageUrl: "...", abilities: [] }` and empty
   arrays for every other category. Assert
   `flattenSet(setData, "Core Set").length === 1`,
   `result[0].cardType === "henchman"`,
   `result[0].slug === "doombot-legion"`,
   `result[0].key === "core-henchman-doombot-legion"`,
   `result[0].setAbbr === "core"`.
2. **`emits zero FlatCards when set.henchmen is empty`** —
   regression baseline: empty `henchmen: []` produces no henchman
   emission.
3. **`falls back through name → "henchman" when slug is absent`** —
   given a henchman entry with no `slug` field, assert the emitted
   `slug` and `key` derive from `name`; given an entry with neither
   `slug` nor `name`, assert the literal fallback `"henchman"` is
   used.

**Recommended optional fourth case:**

4. **`surfaces flat imageUrl and ignores imageUrlByClass when both
   are present`** — fixture henchman with both flat `imageUrl`
   and `imageUrlByClass: { covert, instinct, ranged, strength, tech }`
   (real-data shape from `data/cards/amwp.json` Tardigrade or
   `data/cards/wtif.json` Ultron Sentries). Assert
   `result[0].imageUrl` equals the flat value verbatim and that no
   class-keyed value leaks into the projection. Pins the projection
   contract by test, not just by `// why:` comment.

Post-session baseline is `tests (22 + N) / suites 5 / pass (22 + N) /
fail 0`, where `N ≥ 3` is the number of new `it` cases added. The
mandatory three yields `25 / 5 / 25 / 0`; adding the recommended
fourth yields `26 / 5 / 26 / 0`; further edge-case cases are
permitted and increase `N` accordingly. Any value of `suites` other
than `5`, or any non-zero `fail`, is a FAILED criterion.

## Files to Produce

- `apps/registry-viewer/src/registry/shared.ts` — **modified** —
  henchmen block rewritten to flat treatment mirroring
  bystanders/wounds; emits one `FlatCard` per henchman group with
  `cardType: "henchman"`; required `// why:` block (clauses a–g)
  precedes the loop.
- `apps/registry-viewer/src/registry/shared.test.ts` — **modified** —
  new `describe("flattenSet henchman emission (WP-122)", ...)` block
  with at least three `it` cases (minimum three; fourth recommended).
- Governance at session close (positions 3–8 of the §0(B) staged
  set, not counted against §0(A)'s 2-file runtime scope):
  `STATUS.md` block; `DECISIONS.md` D-12201 entry; `WORK_INDEX.md`
  WP-122 `[ ]` → `[x]`; `EC_INDEX.md` EC-123 Draft → Done; the WP
  and EC files themselves.

## After Completing

- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter registry-viewer typecheck` exits 0.
- [ ] `pnpm --filter registry-viewer test` exits 0 with TAP output
      reporting `tests (22 + N) / suites 5 / pass (22 + N) / fail 0`,
      where `N ≥ 3` is the number of new `it` cases added in this
      session. Any value of `suites` other than exactly `5`, or any
      non-zero `fail`, or `tests ≠ pass`, or `N < 3` is a FAILED
      criterion.
- [ ] `git diff packages/registry/src/shared.ts` → no output.
- [ ] `git diff packages/registry/src/schema.ts` → no output.
- [ ] `git diff apps/registry-viewer/src/registry/schema.ts` → no
      output.
- [ ] `git diff apps/registry-viewer/package.json` → no output (test
      runner is already wired by WP-086; no change here).
- [ ] `git diff --name-only` lists exactly the 8 files in §0(B), no
      more, no less. Any additional file under `apps/`, `packages/`,
      or `data/` is a §0(A) runtime-scope violation; any additional
      file under `docs/` is a §0(B) doc-scope violation. Both are
      FAILED criteria — see §Session Abort Conditions A.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "for \(const card of hmCards\)"`
      returns zero matches.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "for \(const henchman of set\.henchmen\)"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "imageUrlByClass"`
      returns zero matches. The flat-`imageUrl`-only projection
      contract (clause (g) of the required `// why:` block) is
      enforced by gate, not just by review. If any match appears,
      the projection has been widened in violation of §Session
      Abort Conditions B.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "-henchman-"`
      returns at least one match. Confirms the new key shape
      `${abbr}-henchman-${slug}` actually emits in the rewritten
      push site (and not just in comments). Zero matches means the
      `cards.push` body was not wired to the locked key format.
- [ ] Manual smoke on `pnpm --filter registry-viewer dev`: clicking
      the `Henchman` ribbon pill produces a non-empty card grid
      (≥ 44 cards visible across all eagerly-loaded sets); count
      chip ("N cards") shows ≥ 44; toggling Henchman off restores
      the unfiltered count; no Vue console warnings about duplicate
      `v-for` keys; image / data view toggle renders henchman tiles
      without console errors.
- [ ] `docs/ai/STATUS.md` updated — registry viewer cards-view
      Henchman ribbon pill now surfaces 44 henchman FlatCards
      (was 0 pre-fix); test baseline updated.
- [ ] `docs/ai/DECISIONS.md` updated — D-12201 (locked key format
      `${abbr}-henchman-${slug}`, locked test minimum, divergence
      rationale from `packages/registry/src/shared.ts`,
      `imageUrlByClass` deferred to a future `FlatCard`-widening
      WP).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-122 row checked off
      with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-123 row set to
      `Done <date>`.

## Common Failure Smells

- **Symptom:** `pnpm --filter registry-viewer test` reports `tests
  22 / pass 22` (unchanged from baseline) → the new `describe`
  block was added but its `it` cases are not being discovered, or
  the file was saved with a different filename. Verify the new
  block is inside `apps/registry-viewer/src/registry/shared.test.ts`
  (not a sibling new file) and that the describe + it bodies use
  the imported `describe` / `it` from `node:test`.
- **Symptom:** Henchman pill still shows zero cards in manual smoke
  → either the new loop body still references `hmCards` /
  `set.henchmen[i].cards` (the bug rewritten in disguise), or the
  loop's `cards.push` was not added. Re-read the bystanders block
  pattern at `shared.ts:116–130` and mirror it.
- **Symptom:** Vue duplicate-key warning fires on the henchman
  cards → two henchmen in the same set share a `slug`. Verify the
  upstream `data/cards/{abbr}.json` and open a follow-up WP — do
  not in-line patch the slug derivation in this packet.
- **Symptom:** Engine tests fail after the commit → likely means
  `packages/registry/src/shared.ts` was edited despite scope.
  Revert that file; keep only the viewer edit.
- **Symptom:** Typecheck error in the new test cases →
  `flattenSet`'s return type is `FlatCard[]`; assertions on
  optional fields (`vAttack`, `vp`) will fail because `FlatCard`
  doesn't model them. Assert only on `key`, `cardType`, `setAbbr`,
  `setName`, `name`, `slug`, `imageUrl`, `abilities`.
- **Symptom:** New test fixture fails Zod schema validation →
  fixtures are constructed in-memory as `SetData` and bypass
  schema validation entirely; if a Zod error appears, the test is
  passing the fixture through an unintended validation path.
  `flattenSet` accepts `SetData` directly with no Zod parse step.
- **Symptom:** A 9th file appears in `git diff --name-only` →
  Session Abort Condition. The two-file production+test lock is
  intentional. Re-read §0(A) (runtime/implementation scope) vs
  §0(B) (total staged set) to identify which scope was violated.
- **Symptom:** `git diff --name-only` includes any file under
  `apps/**` besides `shared.ts` and `shared.test.ts` → §0(A)
  runtime-scope violation. Unstage and revert the offending file;
  do not continue until the diff is back to the 8-file expected
  set. Common cause: an over-eager `git add -A` or `git add .`
  (forbidden — see §Guardrails staging discipline).
- **Symptom:** `git diff apps/registry-viewer/package.json` shows
  changes → the runner is already wired by WP-086; no
  package.json change is permitted in EC-123. Revert.
- **Symptom:** The `// why:` block has only six clauses (a)–(f),
  missing (g) on `imageUrlByClass` → re-read WP-122 §Required
  `// why:` comments; clause (g) is mandatory after WP-122
  pre-flight RS-1 resolution.
