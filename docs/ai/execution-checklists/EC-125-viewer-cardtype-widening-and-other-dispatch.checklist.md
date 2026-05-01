# EC-125 — Viewer cardType Widening and `set.other[]` Dispatch (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-123-viewer-cardtype-widening-and-other-dispatch.md`
**Layer:** Client UI (`apps/registry-viewer/`)

> **Numbering note:** EC-125 is the next free EC slot after EC-124 was
> claimed by the ad-hoc viewer henchman per-card emission work (commit
> `86029d8`, 2026-05-01). EC-119 remains reserved for WP-115 (Public
> Leaderboard HTTP Endpoints — draft on disk); EC-121 was reserved for
> the unmerged WP-120 Loadout Preview branch per the EC-122 retarget
> breadcrumb. Per the locked precedent (EC-103 → EC-111, EC-101 →
> EC-114, EC-109 → EC-115, EC-121 → EC-122, EC-123, EC-124), the
> WP-keyed EC retargets to the next free slot that does not shadow a
> known or imminent WP — EC-125. The WP number (WP-123) is unchanged.

## §0 — Scope Model (Read Once)

This EC enforces **two distinct scopes**. They are not the same; do not
conflate them.

### A) Runtime / implementation scope (STRICT — 4 files)

Only these four code files under `apps/` may change:

1. `apps/registry-viewer/src/registry/types/types-index.ts`
2. `apps/registry-viewer/src/registry/schema.ts`
3. `apps/registry-viewer/src/registry/shared.ts`
4. `apps/registry-viewer/src/registry/shared.test.ts`

Any other change under `apps/`, `packages/`, or `data/` is a **hard
abort** (see §Session Abort Conditions A).

### B) Total staged set (10 files at session close)

This execution closes WP-123 and records EC-125, so doc/ledger files
are also staged. The complete `git diff --name-only` output at session
end is expected to be exactly these **10** files — no more, no less:

1. `apps/registry-viewer/src/registry/types/types-index.ts`
2. `apps/registry-viewer/src/registry/schema.ts`
3. `apps/registry-viewer/src/registry/shared.ts`
4. `apps/registry-viewer/src/registry/shared.test.ts`
5. `docs/ai/work-packets/WP-123-viewer-cardtype-widening-and-other-dispatch.md`
6. `docs/ai/execution-checklists/EC-125-viewer-cardtype-widening-and-other-dispatch.checklist.md`
7. `docs/ai/work-packets/WORK_INDEX.md`
8. `docs/ai/execution-checklists/EC_INDEX.md`
9. `docs/ai/DECISIONS.md`
10. `docs/ai/STATUS.md`

An 11th file under `apps/`, `packages/`, or `data/` is a runtime-scope
violation (§Session Abort Conditions A). An 11th file under `docs/`
(beyond the 6 ledger/doc files above) is a doc-scope violation
(§Session Abort Conditions A).

> **Staging discipline (read this before any `git add`).**
> Stage by **exact file path only**. Never use `git add .`,
> `git add -A`, or `git add -u`. The repo currently has at least one
> unrelated untracked file
> (`docs/ai/execution-checklists/EC-119-public-leaderboard-http-endpoints.checklist.md`,
> observed at WP-122 pre-flight 2026-05-01 and still untracked at
> WP-123 draft time) that an over-eager blanket-add would pull into
> this commit. Always pass each path explicitly to `git add`. The
> 10-file expected staged set in §0(B) is the sole authority on what
> may be staged. This is the single source of truth for staging
> discipline; §Guardrails references back here rather than restating.
> Placed early because over-eager staging is the most common
> execution failure mode.

> **Canonical widening decision (D-12301):**
> `FlatCard.cardType` widens from the 9-value union to plain `string`
> (not a wider union, not optional, not branded). All references
> below to "widening" refer to this single locked decision.

> **Phase 1 zero-card invariants (WP-086):**
> The existing `describe("Phase 1 ribbon zero-card invariants (WP-086)",
> …)` block at `shared.test.ts:47–76` asserting that `applyQuery`
> returns zero cards for `sidekick` / `shield-agent` / unknown slugs
> against the current narrow fixture. Subsequent references use the
> bolded name above; the block is preserved verbatim under EC-125
> with cast-removal-only edits to lines 49–53 / 54 / 60 / 73.

---

## Before Starting

> **STOP** if any checkbox below is false.

- [ ] WP-086 merged: `data/metadata/card-types.json` exists with 13
      entries; `cardTypesClient.ts` is wired into `App.vue`'s
      `onMounted`; per-card `cardType` schema is `z.string().optional()`
      at `packages/registry/src/schema.ts:174`.
- [ ] WP-122 merged: the henchmen block in
      `apps/registry-viewer/src/registry/shared.ts` is the
      flat-treatment + per-card branch with the seven-clause `// why:`
      block (a)–(g). EC-124 (commit `86029d8`) extended this with the
      multi-card branch — that work is **preserved byte-identical**
      under EC-125; do not modify the henchmen block in this session.
- [ ] `apps/registry-viewer/src/registry/types/types-index.ts` line 37
      reads
      `cardType:  "hero" | "mastermind" | "villain" | "henchman" | "scheme" | "bystander" | "wound" | "location" | "other";`
      (the 9-value union to be widened). Line 123 reads
      `export type FlatCardType = FlatCard["cardType"];` (derived alias;
      widening line 37 cascades automatically).
- [ ] `apps/registry-viewer/src/registry/schema.ts` lines 123–124 carry
      `cardType: z.enum([...]).optional(),` and
      `cardTypes: z.array(z.enum([...])).optional(),` with the same
      9-value enum body.
- [ ] `apps/registry-viewer/src/registry/shared.test.ts` carries the
      existing **Phase 1 zero-card invariants (WP-086)** with three
      `as unknown as FlatCardType[]` casts at lines 54 / 60 / 73 and
      an explanatory `// why:` block at lines 49–53.
- [ ] Baseline captured: `pnpm --filter registry-viewer build`,
      `pnpm --filter registry-viewer typecheck`, and
      `pnpm --filter registry-viewer test` all exit 0 on `main` with
      the test runner reporting `27 / 5 / 27 / 0` (locked post-EC-124
      baseline at preflight HEAD `0f60821`, 2026-05-01). Post-session
      expectation: `30 / 6 / 30 / 0` (mandatory three new cases) or
      `31 / 6 / 31 / 0` (recommended optional fourth case).
- [ ] `data/cards/*.json` `set.other[]` entries verified — the array
      is empty across all 40 sets, OR any non-empty `set.other[]`
      entries have a `cardType` field with a slug present in
      `data/metadata/card-types.json`. If a non-empty `set.other[]`
      entry exists with an unknown `cardType` slug, STOP and
      escalate.
- [ ] `packages/registry/src/shared.ts` does **not** iterate
      `set.other[]` (verified at HEAD via grep — the package-side
      `flattenSet` emits only `hero` / `mastermind` / `villain` /
      `scheme` cardType literals). No parallel fix is required there.
- [ ] No parallel session is editing
      `apps/registry-viewer/src/registry/{types/types-index,schema,shared,shared.test}.ts`.

## Session Abort Conditions

Immediately ABORT (do not continue coding) if any condition below is
observed during execution.

### A) Scope violations (mechanical — checkable via `git diff --name-only`)

- Any edit is proposed to `packages/registry/src/shared.ts`, any file
  under `packages/registry/**`, `packages/game-engine/**`,
  `packages/preplan/**`, `apps/server/**`, or `apps/arena-client/**`.
- Any edit is proposed under `data/**`.
- Any `.vue` file is edited (UI consumer changes are explicitly out of
  scope; the `App.vue:348` cast and `LoadoutBuilder.vue` references to
  `FlatCardType` are preserved verbatim).
- Any additional file under `apps/`, `packages/`, or `data/` appears
  in `git diff --name-only` beyond the four viewer files permitted in
  §0(A).
- Any additional doc file appears in `git diff --name-only` beyond
  the six ledger/doc files in §0(B) (positions 5–10).

### B) Semantic violations

- The widening direction is anything other than the locked targets:
  `FlatCard.cardType: string` (NOT a wider union, NOT `string |
  HardcodedExtras`, NOT a `.brand<…>()` tagged type — plain `string`).
- `CardQuerySchema.cardType` widened to anything other than
  `z.string().optional()`. `CardQuerySchema.cardTypes` widened to
  anything other than `z.array(z.string()).optional()`.
- The `// Other` block is rewritten with a different key shape — the
  locked shape is `` `${abbr}-${cardType}-${slug}` ``. Splitting,
  reversing segment order, or hardcoding a different fallback
  cardType is a FAIL.
- The fallback cardType literal is anything other than `"other"`.
- The henchmen block (`// Henchmen` ... `for (const henchman of
  set.henchmen) { ... }` ... continuing through the per-card branch
  added by EC-124) is modified in any way — byte-identical
  pre- and post-execution.
- The **Phase 1 zero-card invariants (WP-086)** have any
  `assert.equal(result.length, 0)` outcome changed — outcomes are
  preserved verbatim; only the casts and the explanatory `// why:`
  comment are removed.
- The `flattenSet henchman emission (WP-122)` describe block (and
  any EC-124 fifth-case extension) is modified — preserved
  byte-identical.
- `applyQuery` or `buildHealthReport` in `shared.ts` is modified.
- Any refactor, rename, or formatting churn is proposed outside the
  `// Other` block in `shared.ts` or the new
  `flattenSet other-block cardType dispatch (WP-123)` describe block
  in `shared.test.ts` and the three localized cast removals at lines
  54 / 60 / 73 (and the comment block at 49–53).

## Locked Values (do not re-derive)

- **Production files modified (verbatim):**
  - `apps/registry-viewer/src/registry/types/types-index.ts`
  - `apps/registry-viewer/src/registry/schema.ts`
  - `apps/registry-viewer/src/registry/shared.ts`
  - `apps/registry-viewer/src/registry/shared.test.ts`
- **`FlatCard.cardType` widening target (verbatim):** `string`. The
  full line at `types-index.ts:37` becomes:
  `cardType:  string;`
  (preserve the JSDoc comment at line 35 unchanged).
- **`CardQuerySchema.cardType` widening target (verbatim):**
  `cardType:     z.string().optional(),`
- **`CardQuerySchema.cardTypes` widening target (verbatim):**
  `cardTypes:    z.array(z.string()).optional(),`
- **Other-block key shape (verbatim):**
  `` `${abbr}-${cardType}-${slug}` ``
  When `cardType` is absent, `cardType` defaults to literal `"other"`
  via the dispatch expression below, so the key becomes
  `${abbr}-other-${slug}` byte-identical to the pre-packet output.
- **Dispatch expression (verbatim):**
  `const cardType = String(entryRecord["cardType"] ?? "other");`
- **Fallback cardType literal (verbatim):** `"other"`.
- **Loop variable name (verbatim):** `entry` (full English; no
  abbreviation; the locally narrowed `Record<…>` alias inside the
  loop is named `entryRecord`, not `o` or `ot`).
- **Slug fallback chain (verbatim):**
  `String(entryRecord["slug"] ?? entryRecord["name"] ?? "other")`
  — matches the bystanders/wounds fallback shape.
- **Test describe block title (verbatim):**
  `"flattenSet other-block cardType dispatch (WP-123)"`.
- **Pre-session test baseline (verbatim):** `27 / 5 / 27 / 0` (locked
  post-EC-124 at preflight HEAD `0f60821`, 2026-05-01).
- **Expected post-session test baseline (verbatim):** `30 / 6 / 30 / 0`
  (mandatory three new `it` cases) or `31 / 6 / 31 / 0` (recommended
  optional fourth case).
- **Cast removal sites (verbatim line numbers at draft time;
  re-verify at execution start before editing):**
  - `shared.test.ts:54` — drops `as unknown as FlatCardType[]` from
    the `["sidekick"]` literal.
  - `shared.test.ts:60` — drops `as unknown as FlatCardType[]` from
    the `["shield-agent"]` literal.
  - `shared.test.ts:73` — drops `as unknown as FlatCardType[]` from
    the `["totally-fake-slug"]` literal.
  - `shared.test.ts:49–53` — the explanatory `// why:` comment block
    that explains the cast is removed (the cast it explains no
    longer exists).

## Guardrails

- **Four-file production+test scope.** Only the four files in §0(A)
  are edited. Any other file outside that set (governance ledgers
  excluded — see §0) is a scope violation.
- **Stage by exact file path only.** See the staging-discipline
  callout immediately after §0 Scope Model — that callout is the
  single source of truth for staging discipline; do not re-derive.
- **Other-block only in `shared.ts`.** The change applies to the
  `// Other` block exactly once; no other card-type block is
  modified.
- **Replace, do not patch.** The existing `for (const o of set.other)`
  loop with its hardcoded `cardType: "other"` is replaced wholesale
  by the dispatch loop. No leftover `o` / `ot` variables, no leftover
  hardcoded `cardType: "other"` literal, no commented-out dead code.
- **No `packages/registry` edits.** The package-side `flattenSet`
  emits narrow literals that satisfy the widened `string` type
  trivially.
- **No consumer migration.** `App.vue`, `LoadoutBuilder.vue`,
  `CardGrid.vue`, `CardDetail.vue`, `HealthPanel.vue`, and every
  other `.vue` file in `apps/registry-viewer/` require no change —
  they consume `card.cardType` and `card.key` opaquely (string
  comparison + display). The forward-pointing cast at `App.vue:348`
  is preserved verbatim; a future cleanup WP may remove it. **The
  forward-pointing `// why:` comment at `App.vue:113–118` is also
  preserved verbatim** — its phrases like "(9-value union)" and "not
  yet in the FlatCardType union" go loosely stale post-WP-123 but
  remain internally consistent as forward-pointing narrative; do
  NOT modify the comment in this session (deferred to the same
  future cleanup WP that removes the cast at `:348`).
- **No new dependencies.** No `package.json` changes in any
  workspace.
- **No schema change to `SetDataSchema`.**
  `apps/registry-viewer/src/registry/schema.ts` `set.other[]` is
  already `z.array(z.unknown())` and accommodates `cardType`-tagged
  entries under runtime narrowing. Only `CardQuerySchema` widens.
- **No `cardTypesClient.ts` changes.** The taxonomy fetcher and its
  consumers are untouched.
- **No widening of `FlatCardType` to a custom union.** The locked
  target is plain `string` — not a wider union, not a tagged type.
  Future maintainers MUST cite D-12301 if they want to narrow it
  back.
- **No refactor of heroes / masterminds / villains / henchmen /
  schemes / bystanders / wounds blocks.** They are byte-identical
  pre- and post-execution.
- **No `// why:` churn elsewhere in the file.** The required
  `// why:` block is added immediately above the rewritten
  `// Other` loop and nowhere else.
- **No test runner config change.** `apps/registry-viewer/package.json`
  is not modified (the runner is already wired by WP-086).

## Required `// why:` Comments

A multi-line `// why:` block must sit immediately above the new
`for (const entry of set.other)` loop in
`apps/registry-viewer/src/registry/shared.ts`, documenting all
**five** clauses (a)–(e) verbatim from WP-123 §Required `// why:`
comments:

- **(a) Dispatch rationale:** `set.other[]` is the registry's generic
  bucket for cards that don't fit the seven primary categories.
  Reading `entry.cardType` (when present) and using it as the
  FlatCard's `cardType` is the foundation for any future Phase 2
  emission — Sidekick, S.H.I.E.L.D. Officer, Trooper, and Agent, or any
  new taxonomy slug — without hardcoding new top-level loops.
- **(b) Fallback to `"other"`:** entries without a `cardType` field
  preserve the prior behavior (FlatCard.cardType = `"other"`, key =
  `${abbr}-other-${slug}`). This is byte-identical to the pre-WP-123
  output for the existing (currently empty) `set.other[]` arrays —
  introducing the dispatch cannot break compatibility because legacy
  entries take the fallback branch.
- **(c) WP-086 Phase 2 wire-through:** see `WP-086 §Out of Scope`
  ("Phase 2 — upstream `modern-master-strike` generator emits
  `cardType` on each card; regenerate 40 sets — is a follow-up WP,
  not in scope here"). This WP is the viewer side of that wire; the
  upstream data-authoring side is a separate operator/upstream task
  and is out of scope here.
- **(d) D-12301 citation** for the locked decision (key shape,
  fallback string, type-widening pairing).
- **(e) Scope reference WP-123 / EC-125**.

If the `// why:` block omits any of (a)–(e), the EC fails and the
session must re-attempt with the missing clause added.

## Required Test Cases

The new `describe("flattenSet other-block cardType dispatch (WP-123)",
…)` block in `apps/registry-viewer/src/registry/shared.test.ts` must
contain at least three `it` cases (minimum count locked); a fourth
case is recommended.

**Mandatory cases (3):**

1. **`emits one FlatCard with the entry's declared cardType`** —
   fixture `SetData` with one `set.other[]` entry shaped
   `{ id: 1, name: "Wasp", slug: "wasp", cardType: "sidekick",
   imageUrl:
   "https://images.barefootbetters.com/example/example-sk-wasp.webp",
   abilities: [] }` and empty arrays for every other category. Assert
   `flattenSet(setData, "Example Set").filter(c => c.cardType ===
   "sidekick").length === 1`,
   `result[0].slug === "wasp"`,
   `result[0].key === "core-sidekick-wasp"` (where the fixture's
   `abbr` is `"core"`),
   `result[0].setAbbr === "core"`,
   `result[0].imageUrl` equals the fixture value verbatim.
2. **`falls back to "other" when entry has no cardType field`** —
   regression baseline: a `set.other[]` entry without a `cardType`
   field produces `cardType: "other"` and `key:
   "core-other-{slug}"`. Byte-identical to the pre-WP-123
   behavior for legacy entries — proves backward compatibility.
3. **`dispatches multiple entries to their declared cardTypes`** —
   fixture with three `set.other[]` entries:
   `{ cardType: "sidekick", slug: "wasp", name: "Wasp", imageUrl: "...",
   abilities: [] }`,
   `{ cardType: "shield-agent", slug: "phil-coulson", name:
   "Agent Coulson", imageUrl: "...", abilities: [] }`,
   `{ slug: "untagged-card", name: "Untagged", imageUrl: "...",
   abilities: [] }` (no `cardType` field).
   Assert three FlatCards emitted, each with the expected `cardType`
   and `key` shape (`core-sidekick-wasp`,
   `core-shield-agent-phil-coulson`, `core-other-untagged-card`).
   Pins the multi-entry dispatch behavior end-to-end.

**Recommended optional fourth case:**

4. **`emits zero FlatCards from set.other when array is empty`** —
   fixture with `other: []` (and any non-empty other categories
   permitted; the assertion filters on `cardType` to isolate the
   `set.other[]` dispatch result). Result has zero FlatCards whose
   key starts with `${abbr}-` and whose `cardType` came from the
   `// Other` loop. Pins the empty-array regression baseline;
   protects against a future change that accidentally synthesizes
   records when the input is empty.

Post-session baseline is `30 / 6 / 30 / 0` (mandatory three new
cases) or `31 / 6 / 31 / 0` (recommended optional fourth case),
against the locked at-session-start baseline of `27 / 5 / 27 / 0`.
The mandatory three yields a +3 / +1 suite delta; adding the
recommended fourth yields +4 / +1 suite. Any value of `suites`
other than `6`, or any non-zero `fail`, is a FAILED criterion.

## Files to Produce

- `apps/registry-viewer/src/registry/types/types-index.ts` —
  **modified** — `FlatCard.cardType` widened from the 9-value union to
  plain `string` at line 37; JSDoc at line 35 preserved.
- `apps/registry-viewer/src/registry/schema.ts` — **modified** —
  `CardQuerySchema.cardType` and `.cardTypes` widened from `z.enum`
  to `z.string()` / `z.array(z.string())` at lines 123–124.
- `apps/registry-viewer/src/registry/shared.ts` — **modified** —
  `// Other` block rewritten to dispatch on `entry.cardType`; required
  five-clause `// why:` block (a)–(e) precedes the loop; key shape
  `` `${abbr}-${cardType}-${slug}` `` with `"other"` fallback.
- `apps/registry-viewer/src/registry/shared.test.ts` — **modified** —
  three `as unknown as FlatCardType[]` casts removed at lines 54 /
  60 / 73; explanatory `// why:` comment at lines 49–53 removed; new
  `describe("flattenSet other-block cardType dispatch (WP-123)", …)`
  block appended with three mandatory + one recommended `it` cases.
- Governance at session close (positions 5–10 of the §0(B) staged
  set, not counted against §0(A)'s 4-file runtime scope):
  `STATUS.md` block; `DECISIONS.md` D-12301 entry; `WORK_INDEX.md`
  WP-123 `[ ]` → `[x]`; `EC_INDEX.md` EC-125 Draft → Done; the WP
  and EC files themselves.

## After Completing

- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter registry-viewer typecheck` exits 0.
- [ ] `pnpm --filter registry-viewer test` exits 0 with TAP output
      reporting `30 / 6 / pass 30 / fail 0` (mandatory three new
      cases) or `31 / 6 / pass 31 / fail 0` (recommended optional
      fourth case), against the locked at-session-start baseline of
      `27 / 5 / 27 / 0`. Any value of `suites` other than exactly
      `6`, or any non-zero `fail`, or `tests ≠ pass`, or fewer than
      three new `it` cases is a FAILED criterion.
- [ ] `git diff packages/registry/src/shared.ts` → no output.
- [ ] `git diff packages/registry/src/schema.ts` → no output.
- [ ] `git diff apps/registry-viewer/src/App.vue` → no output (the
      forward-pointing cast at `App.vue:348` is preserved verbatim).
- [ ] `git diff apps/registry-viewer/src/components/LoadoutBuilder.vue` →
      no output (the narrow `Record<PickerSlot, FlatCardType>` typing
      satisfies the wider `string` type trivially).
- [ ] `git diff apps/registry-viewer/package.json` → no output.
- [ ] `git diff --name-only` lists exactly the 10 files in §0(B), no
      more, no less. Any additional file under `apps/`, `packages/`,
      or `data/` is a §0(A) runtime-scope violation; any additional
      file under `docs/` is a §0(B) doc-scope violation. Both are
      FAILED criteria — see §Session Abort Conditions A.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "for \(const o of set\.other\)"`
      returns zero matches.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "for \(const entry of set\.other\)"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern '\$\{abbr\}-\$\{cardType\}-\$\{slug\}'`
      returns at least one match. Confirms the new key shape
      actually emits in the rewritten push site (and not just in
      comments). Zero matches means the `cards.push` body was not
      wired to the locked key format.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern 'cardType:\s+"other"'`
      returns zero matches. The literal `"other"` must appear only as
      the fallback default inside the dispatch expression
      (`?? "other"`), never as a hardcoded `cardType:` field value.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\types\types-index.ts" -Pattern 'cardType:\s+string;'`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\types\types-index.ts" -Pattern '"hero"\s+\|\s+"mastermind"'`
      returns zero matches (the 9-value union is gone).
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\schema.ts" -Pattern 'cardType:\s+z\.string\(\)\.optional\(\)'`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\schema.ts" -Pattern 'cardTypes:\s+z\.array\(z\.string\(\)\)\.optional\(\)'`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.test.ts" -Pattern "as unknown as FlatCardType\[\]"`
      returns zero matches.
- [ ] `Select-String -Path "apps\registry-viewer\src\registry\shared.test.ts" -Pattern 'flattenSet other-block cardType dispatch \(WP-123\)'`
      returns at least one match (the new describe block title).
- [ ] Manual smoke (optional, not gated) on
      `pnpm --filter registry-viewer dev`: clicking each ribbon pill
      produces the same card count as the pre-packet baseline; the
      Sidekick / S.H.I.E.L.D. / shield-agent / shield-officer /
      shield-trooper / Other pills still produce zero cards (no
      upstream data yet — expected); no Vue console warnings about
      duplicate `v-for` keys; image / data view toggle renders
      without console errors.
- [ ] `docs/ai/STATUS.md` updated — registry viewer's `FlatCard.cardType`
      widened to `string`; `set.other[]` dispatch wired; pills
      Sidekick / S.H.I.E.L.D. / shield-agent / shield-officer /
      shield-trooper / Other still zero cards (unchanged) until
      domain card data is authored upstream.
- [ ] `docs/ai/DECISIONS.md` updated — D-12301 (locked widening
      direction `string`, locked key shape
      `${abbr}-${cardType}-${slug}`, locked fallback string
      `"other"`, scope-divergence rationale from
      `packages/registry/src/shared.ts`, explicit citation of WP-086
      §Out of Scope Phase 2 deferral, plus a paragraph documenting
      the three-FlatCard-types-coexist state post-WP-123 — engine
      4-value at `packages/registry/src/types/index.ts:57`;
      viewer-legacy 4-value at
      `apps/registry-viewer/src/registry/types/index.ts:37` (unused
      at runtime, EC-102 inheritance); viewer-live `string` at
      `types-index.ts:37`. Legacy-type cleanup deferred to a future
      EC-102-style consolidation WP).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-123 row checked off
      with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-125 row set to
      `Done <date>`.

## Common Failure Smells

- **Symptom:** `pnpm --filter registry-viewer test` reports
  `tests N / pass N` (unchanged from baseline) → the new
  `describe` block was added but its `it` cases are not being
  discovered, or the file was saved with a different filename.
  Verify the new block is inside
  `apps/registry-viewer/src/registry/shared.test.ts` (not a sibling
  new file) and that the `describe` + `it` bodies use the imported
  `describe` / `it` from `node:test`.
- **Symptom:** `vue-tsc --noEmit` errors after widening `FlatCard.cardType`
  to `string` → likely cause: an `App.vue` exhaustive switch on
  `card.cardType` that the widening newly invalidates. Search for
  `switch (.*cardType)` in `apps/registry-viewer/src/**/*.vue` /
  `*.ts`. If none found, the error is in the test file (cast removal
  caused a downstream type mismatch); narrow the cast removal scope
  rather than widening any parent type.
- **Symptom:** `vue-tsc --noEmit` errors at
  `LoadoutBuilder.vue:89` → the `Record<PickerSlot, FlatCardType>`
  typing should still satisfy `Record<PickerSlot, string>`
  trivially. If TypeScript reports an error here, verify
  `FlatCardType` was widened to `string` (not to a different
  shape). The `LoadoutBuilder.vue` file is **not** modified in
  EC-125.
- **Symptom:** Other ribbon pill (the `🃏 Other` pill) suddenly
  shows non-zero cards in manual smoke → either the dispatch is
  emitting the fallback when the entry DOES have a `cardType` (a
  bug in the `?? "other"` logic), or `set.other[]` is no longer
  empty in some set's data. Check `data/cards/*.json` for any
  populated `other[]` arrays first; if empty, fix the dispatch
  expression.
- **Symptom:** Sidekick / S.H.I.E.L.D. / shield-agent / shield-officer
  / shield-trooper pills suddenly show non-zero cards in manual
  smoke → `data/cards/*.json` `set.other[]` carries Phase 2-tagged
  entries. This is unexpected at WP-123 execution time (domain
  authoring is out-of-scope here). Investigate: did upstream Phase 2
  data authoring land while this WP was in flight? If yes, that's a
  scope expansion event; STOP and re-evaluate — the data-authoring
  task should land separately, and the WP should land first as a
  pure wire-through. If no, debug the dispatch logic.
- **Symptom:** Engine tests fail after the commit → likely means
  `packages/registry/src/shared.ts` or `packages/registry/src/schema.ts`
  was edited despite scope. Revert that file; keep only the viewer
  edits.
- **Symptom:** Typecheck error on the new test cases →
  `flattenSet`'s return type is `FlatCard[]`; assertions on
  optional fields (`vAttack`, `vp`) will fail because `FlatCard`
  doesn't model them. Assert only on `key`, `cardType`, `setAbbr`,
  `setName`, `name`, `slug`, `imageUrl`, `abilities`.
- **Symptom:** A test reports `result[0].cardType === "sidekick"` is
  false → the dispatch expression is not reading `entry.cardType`
  correctly, OR the test fixture is not constructing the entry
  correctly (`cardType` field misspelled, missing, or shadowed).
  Verify the locked dispatch expression `String(entryRecord["cardType"]
  ?? "other")` byte-identical and the fixture has `cardType:
  "sidekick"` as a top-level field.
- **Symptom:** An 11th file appears in `git diff --name-only` →
  Session Abort Condition A. The four-file production+test lock is
  intentional. Re-read §0(A) (runtime/implementation scope) vs
  §0(B) (total staged set) to identify which scope was violated.
  Common cause: an over-eager `git add -A` or `git add .`
  (forbidden — see §Guardrails staging discipline).
- **Symptom:** `git diff apps/registry-viewer/src/App.vue` shows
  changes → the cast at `App.vue:348` was removed or the
  forward-pointing comments at `:115–118` were reworded. Both are
  out-of-scope for EC-125 (a future cleanup WP may handle them).
  Revert.
- **Symptom:** `git diff apps/registry-viewer/package.json` shows
  changes → the runner is already wired by WP-086; no
  package.json change is permitted in EC-125. Revert.
- **Symptom:** The `// why:` block has only four clauses (a)–(d),
  missing (e) on scope reference → re-read §Required `// why:`
  Comments; clause (e) is mandatory.
- **Symptom:** The `// why:` block has six or more clauses → likely
  the executor copied WP-122's seven-clause block instead of
  WP-123's five-clause block. The two are different — WP-122's
  henchmen-block clauses (henchmen-shape mismatch, bystanders/wounds
  parallel, divergence-from-`packages/registry`, D-12201,
  WP-122/EC-123, one-record-per-group, class-keyed-art deferral) do
  NOT apply to the `// Other` block. Use the (a)–(e) clause set
  above only.
