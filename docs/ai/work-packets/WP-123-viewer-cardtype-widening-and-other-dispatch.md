# WP-123 — Viewer `cardType` Widening and `set.other[]` Dispatch (WP-086 Phase 2 Wire-Through)

**Status:** Draft (authored 2026-05-01; awaiting user review and lint-gate sign-off)
**Primary Layer:** Client UI (`apps/registry-viewer/`)
**Dependencies:**
- **Hard:** WP-086 (Registry Viewer Card-Types Upgrade — established the
  taxonomy-driven ribbon, the per-card `cardType` data-side widening to
  `z.string().optional()`, the `cardTypesClient.ts` singleton, and the
  `LEGACY_TYPE_GROUPS` fallback. WP-086 §Out of Scope explicitly defers
  Phase 2 wiring to a follow-up WP — this is that WP.)
- **Hard:** WP-003 (CardRegistry + `FlatCard` — the projection type widened
  here; not redesigned, only the `cardType` field is widened).
- **Soft:** WP-122 (Viewer Henchman flattenSet Emission Fix — direct
  structural precedent; same file, same divergent-from-`packages/registry`
  viewer-local copy of `flattenSet`, same single-file viewer-only scope).

---

## Session Context

WP-086 (Registry Viewer Card-Types Upgrade) shipped in two phases. Phase 1
(executed 2026-04-29) installed the taxonomy file
`data/metadata/card-types.json` (13 entries: hero, mastermind, villain,
henchman, scheme, bystander, wound, sidekick, shield, other +
shield-agent/shield-officer/shield-trooper sub-chips), the
`cardTypesClient.ts` runtime fetcher, the `LEGACY_TYPE_GROUPS` fallback,
the taxonomy-driven ribbon button generator in `App.vue`, and widened the
data-side per-card `cardType` to `z.string().optional()`. Phase 1 explicitly
defers Phase 2 — *"upstream `modern-master-strike` generator emits `cardType`
on each card; regenerate 40 sets"* — to a separate WP.

Phase 1 left two known artifacts:

1. **Empty pills:** the `Sidekick`, `S.H.I.E.L.D.` (and its three sub-chip
   children `shield-agent` / `shield-officer` / `shield-trooper`) ribbon
   pills appear in the UI but produce zero cards because no card in
   `data/cards/*.json` carries those `cardType` values. WP-086 Phase 1
   §Test Cases asserted this zero-card invariant intentionally — the pills
   are surfaced ahead of data.
2. **Type-projection drift:** `FlatCard.cardType` at
   `apps/registry-viewer/src/registry/types/types-index.ts:37` is a hardcoded
   9-value union (`"hero" | "mastermind" | "villain" | "henchman" | "scheme"
   | "bystander" | "wound" | "location" | "other"`), narrower than the
   13-entry runtime taxonomy. The viewer's existing code (`App.vue`,
   `shared.test.ts`) already comments and casts around this drift —
   `App.vue:115–118` annotates the local `selectedTypes` widening to
   `Set<string>`; `App.vue:344–348` casts back to `FlatCardType[]` at the
   `registry.query()` call site; `shared.test.ts:49–54` casts
   `["sidekick"] as unknown as FlatCardType[]`. Each cast is a small
   forward-pointer to this WP.

Investigation 2026-05-01 confirmed two further facts that scope this WP:

- **The upstream master-strike data does not carry Sidekick / S.H.I.E.L.D.
  Officer, Trooper, and Agent cards as data.** Survey of the 41 dist
  definitions at
  `C:\Users\jjensen\bbcode\modern-master-strike\src\lib\master-strike-data\dist\definitions\cards\*.js`
  found exactly the 7 top-level array categories already extracted by
  `convert-cards-v15.mjs` (`heroes`, `masterminds`, `villains`, `henchmen`,
  `schemes`, `bystanders`, `wounds`). No `sidekicks: [...]`, no
  `shieldOfficers: [...]`, no shared-stack object at any level. The 4
  sidekick / 16 officer / 1 trooper / 10 agent file-level grep hits are
  all rule-keyword references inside ability text, not standalone cards.
  **Domain authoring is therefore the long-pole task**, not converter
  extraction; this WP does NOT block on it.
- **The `set.other[]` array is empty across all 40 sets** (`data/cards/*.json`),
  so the existing `// Other` block in viewer-local `flattenSet` emits zero
  records today. Any future data backfill that lands `cardType`-tagged
  entries in `set.other[]` (from upstream patches or in-repo data
  authoring) should surface immediately on the right ribbon pill without
  further viewer changes.

This packet is the **viewer-only wire-through** that closes the
type-projection drift and makes `set.other[]` dispatch on the entry's
`cardType` field. After it lands, the viewer is ready to receive any
taxonomy-tagged `set.other[]` entries — Sidekick, S.H.I.E.L.D.
Officer/Trooper/Agent, or any future taxonomy slug — without further
flattenSet changes. The pills go non-empty when card data arrives, not
before, and that data authoring is **out of scope** for this WP per the
domain-data gap noted above.

---

## Goal

> **Canonical widening decision (D-12301):**
> `FlatCard.cardType` widens from the 9-value union to plain `string`
> (not a wider union, not optional, not branded). All references below
> to "widening" refer to this single locked decision.

> **Phase 1 zero-card invariants (WP-086):**
> The existing `describe("Phase 1 ribbon zero-card invariants (WP-086)",
> …)` block at `shared.test.ts:47–76` asserts that `applyQuery` returns
> zero cards for `sidekick` / `shield-agent` / unknown slugs against
> the current narrow fixture. This block is preserved verbatim under
> WP-123 with cast-removal-only edits to lines 49–53 / 54 / 60 / 73.
> Subsequent references use the bolded name above.

After this session:

- `FlatCard.cardType` accepts any string value (widened to plain
  `string`, not optional): the projection always normalizes to a
  concrete string via the `"other"` fallback in the dispatch
  expression, eliminating downstream `undefined` handling.
- The viewer's local `flattenSet()` `// Other` block reads each
  `set.other[]` entry's `cardType` field and uses it (with an `"other"`
  fallback when absent) for both the FlatCard's `cardType` value and the
  key prefix `${abbr}-${cardType}-${slug}`.
- A new test block in `shared.test.ts` asserts the dispatch behavior
  end-to-end with at least three cases: tagged entry surfaces under its
  declared `cardType`; untagged entry falls back to `"other"`; multiple
  entries with different `cardType` values each surface under the right
  pill.
- The existing `as unknown as FlatCardType[]` casts in
  `shared.test.ts:54 / 60 / 73` are removed (no longer needed once
  `FlatCardType` widens to `string`).
- The **Phase 1 zero-card invariants (WP-086)** are preserved verbatim
  — the underlying fixture still has no `set.other[]` entries with
  Phase 2 cardTypes, so `applyQuery`'s zero-card outcomes are unchanged.
- All other `flattenSet` blocks (heroes, masterminds, villains, schemes,
  henchmen, bystanders, wounds) are unchanged.
- The `packages/registry/src/shared.ts` copy of `flattenSet` is
  **unchanged** — that copy already emits a narrow set of `cardType`
  literals (hero / mastermind / villain / scheme) that are subsets of
  the widened type; no engine-side change is required.

---

## Assumes

- WP-086 complete: `data/metadata/card-types.json` exists with 13 entries;
  `cardTypesClient.ts` is wired; `App.vue` builds the ribbon from
  taxonomy with `LEGACY_TYPE_GROUPS` fallback; per-card `cardType` schema
  is `z.string().optional()`.
- WP-122 complete: the henchmen block is the flat-treatment + per-card
  branch (the working tree at session start may carry an additional
  EC-124 ad-hoc multi-card branch — that is orthogonal to this WP and
  must NOT be reverted or modified).
- `apps/registry-viewer/src/registry/types/types-index.ts` line 37 reads
  `cardType:  "hero" | "mastermind" | "villain" | "henchman" | "scheme"
  | "bystander" | "wound" | "location" | "other";` (the 9-value union to
  be widened).
- `apps/registry-viewer/src/registry/schema.ts` lines 123–124 carry
  `CardQuerySchema.cardType` and `.cardTypes` as the same 9-value
  `z.enum`. These are widened in this WP to `z.string().optional()` /
  `z.array(z.string()).optional()` so query objects can carry
  taxonomy-tagged slugs without callers casting.
- `apps/registry-viewer/src/registry/shared.test.ts` carries the
  existing four-case `Phase 1 ribbon zero-card invariants (WP-086)`
  describe block and the four-or-five-case
  `flattenSet henchman emission (WP-122)` describe block.
- `pnpm --filter registry-viewer build` exits 0 on `main` pre-session.
- `pnpm --filter registry-viewer typecheck` exits 0 on `main`
  pre-session.
- `pnpm --filter registry-viewer test` reports the post-EC-124 baseline
  `27 / 5 / 0` (locked at preflight HEAD `0f60821`, 2026-05-01).
- The upstream master-strike-data dist files do not carry Sidekick /
  S.H.I.E.L.D. Officer, Trooper, and Agent standalone card data
  (verified 2026-05-01; documented in §Session Context). If this
  changes upstream before execution, that is a scope expansion and
  the WP must be re-reviewed.

If any of the above is false, this packet is **BLOCKED** and must
not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  registry-viewer's allowed import surface; this WP stays entirely
  inside the Client UI layer (`apps/registry-viewer/src/registry/`)
  and does not touch Registry, Engine, Server, or Pre-Plan.
- `.claude/rules/architecture.md §Layer Boundary` — runtime
  enforcement view of the same rules.
- `.claude/rules/code-style.md §Patterns to Avoid` — repo-wide bans
  on `Math.random` / `Date.now` / `.reduce()` for branching /
  abbreviations / dynamic property access for known keys / `import *`
  / barrel re-exports. Applies to all new and modified code in this
  packet.
- `apps/registry-viewer/CLAUDE.md` — viewer architecture (Vue 3 + Vite 5
  + Zod), single-page tab switching, R2 data source, layer-import
  table.
- `apps/registry-viewer/src/registry/types/types-index.ts` — the
  `FlatCard` type at lines ~30–50. Read fully; line 37 carries the
  9-value `cardType` union to be widened to `string`. Note line 123
  exports `FlatCardType = FlatCard["cardType"]` (a derived alias) —
  widening line 37 cascades through this alias automatically.
- `apps/registry-viewer/src/registry/schema.ts` — lines 123–124 carry
  `CardQuerySchema.cardType` and `.cardTypes` as `z.enum`. Widen to
  `z.string()` mirroring the data-side widening already shipped by
  WP-086 (per-card `cardType` at line 174 in `packages/registry/src/schema.ts`
  is `z.string().optional()`).
- `apps/registry-viewer/src/registry/shared.ts` — the file modified
  here. Read fully; the `// Other` block at the bottom of `flattenSet`
  is the modification target; all other blocks (heroes, masterminds,
  villains, henchmen, schemes, bystanders, wounds) are unchanged.
  Note: the henchmen block at lines ~78–148 carries the WP-122 +
  EC-124 multi-branch logic that must remain byte-identical.
- `apps/registry-viewer/src/registry/shared.test.ts` — read fully.
  The existing two describe blocks are preserved. A new third block
  is appended. The three `as unknown as FlatCardType[]` casts at
  lines 54 / 60 / 73 are removed (no longer needed after widening).
- `apps/registry-viewer/src/App.vue` — read lines 115–118 and
  344–348 only; these annotate the existing `selectedTypes` widening
  and the cast at the `registry.query()` call site. **Not modified**
  here — the widening of `FlatCardType` at the projection layer
  removes the *need* for the cast, but the cast itself is harmless
  and out of scope for this WP. A future cleanup WP may remove it.
- `packages/registry/src/shared.ts` — read for confirmation only;
  **MUST NOT be modified**. Confirms that the engine-side `flattenSet`
  emits only narrow literals (hero / mastermind / villain / scheme)
  that satisfy the widened `string` type trivially.
- `data/metadata/card-types.json` — read for taxonomy reference only.
  The 13 entries define the runtime cardType slugs that the widened
  `FlatCard.cardType` is permitted to hold. **Not modified.**
- `docs/ai/work-packets/WP-086-registry-viewer-card-types-upgrade.md` —
  scan §Out of Scope for the Phase 2 deferral language; cite at
  `D-12301` rationale.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations),
  Rule 6 (`// why:` comments where reason is non-obvious), Rule 7
  (no `.reduce()` for branching), Rule 13 (ESM only).
- `docs/ai/DECISIONS.md` — scan for any prior decision on Phase 2
  emission or `FlatCardType` widening. None expected; D-12301 is the
  new entry.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ — all new and modified code uses `import` /
  `export`, never `require()`.
- `node:` prefix on all Node.js built-in imports (the test file
  already uses `node:test` and `node:assert`; preserved).
- Test files use `.test.ts` extension — never `.test.mjs`.
- No `Math.random()`, no `Date.now()`, no `performance.now()`, no
  `new Date(`. Not applicable in scope (pure data-transformation +
  type widening; static fixtures in tests).
- Full file contents required for every new or modified file —
  diffs, snippets, and partial output are forbidden.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (full
  English names, `// why:` comments where the reason is non-obvious,
  no `.reduce()` for branching logic).
- No new npm dependencies. `package.json` files are unchanged.

**Packet-specific:**
- **Sole production files modified:**
  - `apps/registry-viewer/src/registry/types/types-index.ts` (one-line
    type widening at line 37).
  - `apps/registry-viewer/src/registry/schema.ts` (two-line widening at
    lines 123–124 — `CardQuerySchema.cardType` and `.cardTypes`).
  - `apps/registry-viewer/src/registry/shared.ts` (`// Other` block
    rewritten to dispatch on `entry.cardType`).
- **Sole test file modified:**
  - `apps/registry-viewer/src/registry/shared.test.ts` (new describe
    block; cast removal in three lines).
- **Other-block only.** The heroes, masterminds, villains, henchmen,
  schemes, bystanders, and wounds blocks in `shared.ts` are not
  touched. No reformatting churn elsewhere in the file.
- **Henchmen block preservation.** The henchmen block at lines ~78–148
  carries the WP-122 + EC-124 multi-branch logic and the seven-clause
  `// why:` block (a)–(g). **Byte-identical pre- and post-execution.**
- **Phase 1 describe block preservation.** The
  **Phase 1 zero-card invariants (WP-086)** are preserved verbatim —
  the underlying fixture has no Phase 2 entries, so the zero-card
  outcomes still hold. Only the cast on lines 54 / 60 / 73 is removed
  and the explanatory `// why:` comment at lines 49–53; the test
  bodies and expected counts are unchanged.
- **No `packages/registry` changes.** The engine-side `flattenSet`
  emits only narrow literals; widening the consumer projection type
  does not require an engine-side change.
- **No `cardTypesClient.ts` changes.** The taxonomy fetcher is
  consumed elsewhere (`App.vue` ribbon generation); this WP does not
  alter the fetcher or its consumers.
- **No `App.vue` / `LoadoutBuilder.vue` / other component changes.**
  The widened `FlatCardType` is a strict superset of the prior
  9-value union; existing component code that constrains values to
  the narrow set (e.g., `LoadoutBuilder.vue` `slotToCardType`
  Record at line 89) continues to satisfy the wider type. The forward-
  pointing comments at `App.vue:113–118` and the cast at `:348` are
  preserved verbatim — a future cleanup WP may remove them. **Note:
  the `// why:` comment at `App.vue:113–118` was authored under
  WP-086 anticipating this widening; phrases like "(9-value union)"
  and "not yet in the FlatCardType union" become loosely stale
  post-WP-123.** The comment remains internally consistent as a
  forward-pointing narrative ("this local widening anticipates a
  future widening of FlatCardType" — that future is now); full
  cleanup is deferred to the same future WP that removes the cast
  at `App.vue:348`.
- **No schema change to `SetDataSchema`.** `set.other[]` is already
  `z.array(z.unknown())` and accommodates entries with arbitrary
  `cardType` strings under the runtime narrowing.
- **Key shape (verbatim):** `` `${abbr}-${cardType}-${slug}` ``. When
  `cardType` is absent, the fallback uses `"other"` so the key
  becomes `${abbr}-other-${slug}` — byte-identical to the current
  output for entries that don't carry a `cardType` field.

**Required `// why:` comments:**

A multi-line `// why:` block immediately above the rewritten `// Other`
loop in `apps/registry-viewer/src/registry/shared.ts`, documenting all
**five** clauses (a)–(e):

- **(a)** **Dispatch rationale:** `set.other[]` is the registry's
  generic bucket for cards that don't fit the seven primary categories.
  Reading `entry.cardType` (when present) and using it as the FlatCard's
  `cardType` is the foundation for any future Phase 2 emission — Sidekick,
  S.H.I.E.L.D. Officer, Trooper, and Agent, or any new taxonomy slug — without
  hardcoding new top-level loops.
- **(b)** **Fallback to `"other"`:** entries without a `cardType` field
  preserve the prior behavior (FlatCard.cardType = `"other"`, key =
  `${abbr}-other-${slug}`). This is byte-identical to the pre-WP-123
  output for the existing (currently empty) `set.other[]` arrays —
  introducing the dispatch cannot break compatibility because legacy
  entries take the fallback branch.
- **(c)** **WP-086 Phase 2 wire-through:** see `WP-086 §Out of Scope`
  ("Phase 2 — upstream `modern-master-strike` generator emits `cardType`
  on each card; regenerate 40 sets — is a follow-up WP, not in scope
  here"). This WP is the viewer side of that wire; the upstream
  data-authoring side is a separate operator/upstream task and is out
  of scope here.
- **(d)** **D-12301 citation** for the locked decision (key shape,
  fallback string, type-widening pairing).
- **(e)** **Scope reference WP-123 / EC-(next free slot at execution)**.

**Session protocol:**

- If any of the following arises, STOP and ASK before proceeding:
  - The pre-session test baseline does not match the locked
    post-EC-124 baseline `27 / 5 / 0`.
  - `FlatCard.cardType` at `types-index.ts:37` is not the 9-value union
    described in §Assumes (e.g., a parallel session already widened it
    or narrowed it differently).
  - Any `set.other[]` entry across `data/cards/*.json` is found to
    carry an unexpected `cardType` value during execution — verify the
    taxonomy slug exists in `data/metadata/card-types.json`; if it
    does not, escalate (would imply data drift from a parallel session
    or a Phase 2 upstream landing arriving sooner than expected).
  - The cast removal at `shared.test.ts:54 / 60 / 73` causes the test
    file to fail to compile under `vue-tsc` — check whether
    `CardQueryExtended.cardTypes` retains a narrower type than
    `string[]` (e.g., from a parent type re-export); if so, narrow the
    cast removal scope rather than widening the parent type.

**Locked contract values (inline — do not paraphrase or re-derive):**

- **`FlatCard.cardType` widened to (verbatim):** `string`. Not
  `string | "hero" | ...`, not a re-derived union, not a `.brand<…>()`
  tagged type — plain `string`.
- **`CardQuerySchema.cardType` widened to (verbatim):**
  `z.string().optional()`. **`CardQuerySchema.cardTypes` widened to
  (verbatim):** `z.array(z.string()).optional()`.
- **Other-block key shape (verbatim):** `` `${abbr}-${cardType}-${slug}` ``.
  When `cardType` is absent, `cardType` defaults to literal `"other"`
  so the key becomes `${abbr}-other-${slug}` byte-identical to the
  pre-packet output.
- **Fallback cardType literal (verbatim):** `"other"`.
- **Loop variable name (verbatim):** `entry` (full English; no
  abbreviation; the locally narrowed `Record<…>` alias inside the loop
  is named `entryRecord`, not `o` or `ot`).
- **Test describe block title (verbatim):**
  `"flattenSet other-block cardType dispatch (WP-123)"`.
- **Test cast removal sites (verbatim):**
  `shared.test.ts:54` — drops `as unknown as FlatCardType[]` from
  `["sidekick"]`.
  `shared.test.ts:60` — drops `as unknown as FlatCardType[]` from
  `["shield-agent"]`.
  `shared.test.ts:73` — drops `as unknown as FlatCardType[]` from
  `["totally-fake-slug"]`.
  The `// why:` comment block at `shared.test.ts:49–53` is also
  removed (the cast it explains no longer exists).

---

## Vision Alignment

**Vision clauses touched:** §10a (Registry Viewer public surface —
search and browse quality on `cards.barefootbetters.com`).

**Conflict assertion:** No conflict. This WP closes the type-projection
drift surfaced by WP-086 Phase 1 and makes the `set.other[]` block
data-driven by `cardType`. It adds no monetization, no persuasive
surface, no competitive ranking implication, no change to user-visible
copy. The Sidekick / S.H.I.E.L.D. ribbon pills remain empty until
domain card data is authored upstream — that is out of scope here.

**Non-Goal proximity check:** None of NG-1..NG-7 is crossed. This is
a viewer-only correctness fix on free public reference tooling.

**Determinism preservation:** N/A — no scoring, replay, RNG, or
simulation surfaces are touched. `flattenSet` is a pure
data-transformation helper; this WP changes only how the `// Other`
block routes entries by `cardType`, not the order or contents of any
RNG-driven path.

---

## Funding Surface Gate

**§20 — N/A.** This WP touches no §20.1 trigger surface: no global
nav funding affordance, no registry-viewer funding affordance, no
profile-level funding attribution, no tournament-funding integration,
and no user-visible copy referencing donate / support / tournament
funding. The ribbon pill labels (`Sidekick`, `S.H.I.E.L.D.`, etc.)
and the search grid are pre-existing UI elements (introduced under
WP-086); this WP does not introduce or modify any user-visible copy.
Justification per §20.1 N/A discipline: "registry-viewer
type-projection alignment + dispatch wire-through; no UI surfaces
added, no user-visible copy added, no funding channels referenced."

---

## §21 API Catalog — N/A

This WP touches no §21.1 trigger surface: no HTTP endpoint added,
modified, removed, or status-changed in `apps/server`; no
`apps/server/src/**` library function added or modified.
Justification per §21.4: "viewer-only type-widening + dispatch fix;
no `apps/server` files touched, no HTTP surface affected."

---

## Debuggability & Diagnostics

This packet is data-transformation-only and introduces no game state,
no RNG, and no mutation of `G` / `ctx`. The applicable subset of the
template's diagnostics clauses:

- **Deterministic reproduction:** `flattenSet` is a pure function of
  its `(set, setName)` inputs. Identical input + identical name =
  identical `FlatCard[]` output.
- **External observability:** the new dispatch is visible in the card
  grid (any Phase 2-tagged `set.other[]` entry surfaces under the
  declared ribbon pill) and in the diagnostic panel's `totalCards`
  count (`HealthPanel.vue`'s `summary.totalCards` increases by the
  count of any future tagged entries; today no such entries exist
  so the count is unchanged).
- **State mutation surface:** none. `flattenSet` returns a new
  array; it does not mutate the input set or any module-scoped
  state.
- **Failure localization:** any visible regression in `set.other[]`
  emission must trace to the rewritten `// Other` block; if it does
  not, the packet's scope was violated.
- **`G.messages` usage:** N/A — this packet does not touch `G`.

---

## Scope (In)

### A) `apps/registry-viewer/src/registry/types/types-index.ts` — modified

- Widen `FlatCard.cardType` (line 37) from the 9-value string union to
  plain `string`. Preserve the JSDoc comment at line 35
  (`/** Unique key: "{setAbbr}-{cardType}-{slug}" */`). No other
  change to the file.
- The derived alias `FlatCardType = FlatCard["cardType"]` at line 123
  resolves to `string` automatically — no separate edit needed.

### B) `apps/registry-viewer/src/registry/schema.ts` — modified

- Widen `CardQuerySchema.cardType` (line 123) from
  `z.enum([...]).optional()` to `z.string().optional()`.
- Widen `CardQuerySchema.cardTypes` (line 124) from
  `z.array(z.enum([...])).optional()` to
  `z.array(z.string()).optional()`.
- No other change to the file. `SetDataSchema` and all other schemas
  unchanged.

### C) `apps/registry-viewer/src/registry/shared.ts` — modified

- Replace the existing `// Other` block (currently the last block in
  `flattenSet`, before `return cards;`) with a dispatch loop that:
  - Iterates `for (const entry of set.other)`, skipping non-object /
    null entries with `continue`.
  - Narrows each entry to `Record<string, unknown>` aliased as
    `entryRecord`.
  - Normalizes `cardType` and `slug` from the entry's fields with the
    locked fallback chain (see §Locked Contract Values).
  - Pushes exactly one `FlatCard` per valid entry with key shape
    `` `${abbr}-${cardType}-${slug}` `` and the standard FlatCard
    fields populated from `entryRecord` (verbatim field assignments
    enforced via §Locked Contract Values + §Verification Steps grep
    gates).
- Add the multi-line `// why:` block (clauses (a)–(e) per §Required
  `// why:` comments) immediately above the rewritten loop.
- All other blocks (heroes, masterminds, villains, henchmen, schemes,
  bystanders, wounds), `applyQuery`, and `buildHealthReport` are
  **unchanged**.

### D) `apps/registry-viewer/src/registry/shared.test.ts` — modified

- Remove the three `as unknown as FlatCardType[]` casts at lines 54 /
  60 / 73 (they are no longer needed once `FlatCardType` widens to
  `string`). Remove the explanatory `// why:` comment block at lines
  49–53 (the cast it explains no longer exists). The test bodies and
  expected `assert.equal(result.length, 0)` outcomes are unchanged.
- Append a new `describe("flattenSet other-block cardType dispatch
  (WP-123)", () => { ... })` block after the existing
  `flattenSet henchman emission (WP-122)` describe block.
- Reuse the existing `buildHenchmanFixture` helper pattern: add a
  parallel `buildOtherFixture(other: unknown[]): SetData` helper, OR
  inline the fixture inside each `it` body — either pattern is
  acceptable. Consistency with the henchman block wins.
- Test cases per §Required Test Cases below.

---

## Out of Scope

- **No card data authoring.** Sidekick, S.H.I.E.L.D. Officer /
  Trooper / Agent, or any other taxonomy slug's actual card text
  (names, costs, abilities, image URLs) is **not authored in this
  WP**. The pills remain empty until domain authoring lands upstream
  in a separate task. This WP makes the viewer ready to surface
  any future tagged data without further changes.
- **No upstream `bbcode/modern-master-strike` changes.** The
  converter and the dist data files are out of scope. Any future
  Phase 2 data backfill is a separate upstream PR + regen + commit
  cycle, not part of this WP.
- **No `convert-cards-v15.mjs` changes.** The converter currently
  emits `other: []` (empty) and is correct for the current data
  shape. Extending it to emit `set.other[]` entries is part of any
  future data-authoring task, not this WP.
- **No changes to `packages/registry/**`.** The engine-side
  `flattenSet` emits narrow literals (hero / mastermind / villain /
  scheme) that satisfy the widened `string` type trivially.
- **No `App.vue` / `LoadoutBuilder.vue` / other component
  changes.** The forward-pointing cast at `App.vue:348` and the
  three `as unknown as FlatCardType[]` casts already-removed in this
  WP's test file are the only widening-related sites known. The
  `App.vue` cast itself is preserved verbatim; a future cleanup WP
  may remove it.
- **No `cardTypesClient.ts` / taxonomy / ribbon UI changes.** The
  taxonomy fetcher and the ribbon generation logic in `App.vue` are
  consumed unchanged.
- **No widening of `SetDataSchema`.** `set.other[]` is already
  `z.array(z.unknown())` and accommodates the `cardType`-tagged
  entries under runtime narrowing.
- **No new test runner / no `package.json` changes.** The viewer's
  `node:test` runner (wired by WP-086) is reused.
- **No new ribbon pill or filter behavior.** Existing pills
  (Sidekick, S.H.I.E.L.D., shield-agent, shield-officer,
  shield-trooper) introduced under WP-086 are unchanged. Pill
  filtering behavior under `applyQuery` is unchanged (string
  equality on `cardType`).
- **Removal of the `App.vue:348` cast.** That cast is harmless
  after this WP (the value matches the wider type trivially); a
  cleanup WP may remove it later. Out of scope here to minimize
  blast radius.

---

## Files Expected to Change

- `apps/registry-viewer/src/registry/types/types-index.ts` —
  **modified** — `FlatCard.cardType` widened to `string`.
- `apps/registry-viewer/src/registry/schema.ts` — **modified** —
  `CardQuerySchema.cardType` and `.cardTypes` widened from `z.enum`
  to `z.string()` / `z.array(z.string())`.
- `apps/registry-viewer/src/registry/shared.ts` — **modified** —
  `// Other` block rewritten to dispatch on `entry.cardType`; required
  five-clause `// why:` block precedes the loop.
- `apps/registry-viewer/src/registry/shared.test.ts` — **modified** —
  three `as unknown as FlatCardType[]` casts removed; new
  `describe("flattenSet other-block cardType dispatch (WP-123)", …)`
  block appended.
- `docs/ai/work-packets/WP-123-viewer-cardtype-widening-and-other-dispatch.md` —
  **new** — this file.
- `docs/ai/execution-checklists/EC-(next free slot)-viewer-cardtype-widening-and-other-dispatch.checklist.md` —
  **new** — companion EC (drafted in a follow-up authoring step;
  EC slot to be picked at draft time per the EC numbering precedent).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — adds the
  WP-123 row at Commit B.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — adds
  the EC-(next-slot) row at Commit B.
- `docs/ai/DECISIONS.md` — **modified** — adds D-12301 (locked
  widening direction, locked key shape, locked fallback string,
  scope-divergence rationale from `packages/registry/src/shared.ts`,
  plus a paragraph acknowledging the three-FlatCard-types-coexist
  state post-WP-123 — engine 4-value at
  `packages/registry/src/types/index.ts:57`; viewer-legacy 4-value at
  `apps/registry-viewer/src/registry/types/index.ts:37` (unused at
  runtime, inherited from EC-102 consolidation); viewer-live `string`
  at `types-index.ts:37`. The widening is intentionally scoped to the
  live viewer projection only; legacy-type cleanup is deferred to a
  future EC-102-style consolidation WP).
- `docs/ai/STATUS.md` — **modified** — adds the WP-123 execution
  entry at the top of `## Current State`.

---

## Required Test Cases

The new `describe("flattenSet other-block cardType dispatch
(WP-123)", ...)` block must contain at least three `it` cases
(minimum count locked).

**Mandatory cases (3):**

1. **`emits one FlatCard with the entry's declared cardType`** —
   fixture `SetData` with one `set.other[]` entry shaped
   `{ id: 1, name: "Wasp", slug: "wasp", cardType: "sidekick",
   imageUrl: "https://images.barefootbetters.com/example/example-sk-wasp.webp",
   abilities: [] }` and empty arrays for every other category.
   Assert `result[0].cardType === "sidekick"`,
   `result[0].slug === "wasp"`,
   `result[0].key === "core-sidekick-wasp"`,
   `result[0].setAbbr === "core"`,
   `result[0].imageUrl` equals the fixture value verbatim.
2. **`falls back to "other" when entry has no cardType field`** —
   regression baseline: a `set.other[]` entry without a `cardType`
   field produces `cardType: "other"` and `key:
   "core-other-{slug}"`. This is byte-identical to the pre-WP-123
   behavior for legacy entries (proves backward compatibility).
3. **`dispatches multiple entries to their declared cardTypes`** —
   fixture with three `set.other[]` entries:
   `{ cardType: "sidekick", slug: "wasp" }`,
   `{ cardType: "shield-agent", slug: "phil-coulson" }`,
   `{ slug: "untagged-card" }` (no cardType field).
   Assert three FlatCards emitted, each with the expected
   `cardType` and `key` shape (`core-sidekick-wasp`,
   `core-shield-agent-phil-coulson`, `core-other-untagged-card`).
   Pins the multi-entry dispatch behavior end-to-end.

**Recommended optional fourth case:**

4. **`emits zero FlatCards from set.other when array is empty`** —
   fixture with `other: []`. Result has zero entries with
   `cardType !== "other"` (and zero entries from the other-block
   loop). Pins the empty-array regression baseline; protects against
   a future change that accidentally synthesizes records when the
   input is empty. (Less load-bearing than cases 1–3 since the
   loop's `for…of` over an empty array is structurally guaranteed
   not to iterate, but the assertion is cheap and protects against
   a future maintainer mis-refactoring the loop.)

**Test discipline:**

- Each new `it` body uses `node:test` (`describe` / `it`) and
  `node:assert` `strict` only — reuse the imports already in the
  file.
- No `boardgame.io` import.
- Assert only on `FlatCard` fields that the type actually models
  (`key`, `cardType`, `setAbbr`, `setName`, `name`, `slug`,
  `imageUrl`, `abilities`).
- Fixtures are constructed in-memory as `SetData`-typed objects (or
  `as SetData` casts where needed); they do NOT round-trip through
  Zod parsing.
- The **Phase 1 zero-card invariants (WP-086)** are preserved with
  cast removal only — the `assert.equal(result.length, 0)` outcomes
  are unchanged because the fixture has no `set.other[]` entries
  that would now be dispatched.

Post-session baseline is `30 / 6 / 30 / 0` (mandatory three new
cases) or `31 / 6 / 31 / 0` (recommended optional fourth case),
based on the locked at-session-start baseline of `27 / 5 / 27 / 0`.
Adding additional cases increases the test count proportionally;
the suite count remains `6` and the fail count remains `0`.

---

## Acceptance Criteria

- [ ] `apps/registry-viewer/src/registry/types/types-index.ts` line 37
      reads `cardType:  string;` (widened from the 9-value union).
- [ ] `apps/registry-viewer/src/registry/schema.ts` lines 123–124 read
      `cardType:     z.string().optional(),` and
      `cardTypes:    z.array(z.string()).optional(),` (widened from
      `z.enum`).
- [ ] `apps/registry-viewer/src/registry/shared.ts` `// Other` block
      contains a `for (const entry of set.other)` loop that pushes one
      `FlatCard` per non-null entry with `cardType:
      String(entryRecord["cardType"] ?? "other")` and `key:
      \`${abbr}-${cardType}-${slug}\``.
- [ ] No `cardType:  "other",` literal remains as a hardcoded value
      in the `// Other` block (verified via grep).
- [ ] A multi-line `// why:` block immediately precedes the rewritten
      `// Other` loop, satisfying every clause (a)–(e) of §Required
      `// why:` comments.
- [ ] `apps/registry-viewer/src/registry/shared.test.ts` contains a
      `describe("flattenSet other-block cardType dispatch (WP-123)",
      …)` block with at least three `it` cases.
- [ ] The three `as unknown as FlatCardType[]` casts at
      `shared.test.ts:54 / 60 / 73` are removed; the explanatory
      `// why:` comment at lines 49–53 is removed; the
      `assert.equal(result.length, 0)` outcomes are unchanged.
- [ ] `packages/registry/src/shared.ts` is **unchanged** (`git diff
      packages/registry/src/shared.ts` → no output).
- [ ] `apps/registry-viewer/src/App.vue` is **unchanged** (`git diff
      apps/registry-viewer/src/App.vue` → no output).
- [ ] No file outside §Files Expected to Change is modified
      (`git diff --name-only` lists only the files listed there).
- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter registry-viewer typecheck` exits 0.
- [ ] `pnpm --filter registry-viewer test` reports `30 / 6 / 0`
      (mandatory three) or `31 / 6 / 0` (recommended fourth) — at
      least the three mandatory cases must pass on a baseline of
      `27 / 5 / 0`.

---

## Verification Steps

```pwsh
# 1. Build + typecheck the viewer
pnpm --filter registry-viewer build
pnpm --filter registry-viewer typecheck

# 2. Run the viewer test suite — confirm new baseline
pnpm --filter registry-viewer test
# Expected: 30 / 6 / 0 (mandatory three new cases) or 31 / 6 / 0
# (recommended optional fourth case), against the locked
# at-session-start baseline of 27 / 5 / 0.

# 3. Confirm packages/registry is untouched
git diff packages/registry/src/shared.ts
# Expected: no output.

# 4. Confirm App.vue is untouched
git diff apps/registry-viewer/src/App.vue
# Expected: no output.

# 5. Confirm scope
git diff --name-only
# Expected: only the files listed in §Files Expected to Change.

# 6. Confirm the // Other block was rewritten (not patched in place)
Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "for \(const o of set\.other\)"
# Expected: zero matches.
Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern "for \(const entry of set\.other\)"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern 'cardType:\s+"other"'
# Expected: zero matches in the // Other block (the literal "other" only
# appears as the fallback default inside the dispatch expression now).
Select-String -Path "apps\registry-viewer\src\registry\shared.ts" -Pattern '\$\{abbr\}-\$\{cardType\}-\$\{slug\}'
# Expected: at least one match (proves the new key shape emits at the
# push site).

# 7. Confirm type widening at the projection layer
Select-String -Path "apps\registry-viewer\src\registry\types\types-index.ts" -Pattern "cardType:\s+string;"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\registry\types\types-index.ts" -Pattern "\"hero\"\s+\|\s+\"mastermind\""
# Expected: zero matches (the 9-value union is gone).

# 8. Confirm cast removal in tests
Select-String -Path "apps\registry-viewer\src\registry\shared.test.ts" -Pattern "as unknown as FlatCardType\[\]"
# Expected: zero matches.

# 9. Manual smoke (optional, not gated)
# Terminal: pnpm --filter registry-viewer dev
# Open http://localhost:5173
#   1. Click each ribbon pill — heroes / masterminds / villains /
#      henchmen / schemes / bystanders / wounds counts UNCHANGED from
#      the pre-packet baseline. Sidekick / S.H.I.E.L.D. / shield-agent
#      / shield-officer / shield-trooper / Other still produce zero
#      cards (no upstream data yet — expected).
#   2. Open the browser DevTools console — confirm no new "Duplicate
#      keys detected" Vue warning on initial render or on filter
#      toggle.
```

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] All Verification Steps pass.
- [ ] `git diff --name-only` shows only the files in §Files Expected
      to Change.
- [ ] D-12301 added to `docs/ai/DECISIONS.md` (locked widening
      direction, locked key shape, locked fallback string,
      scope-divergence rationale from `packages/registry/src/shared.ts`,
      explicit citation of WP-086 §Out of Scope Phase 2 deferral,
      paragraph documenting the three-FlatCard-types-coexist state
      post-WP-123 with future-cleanup deferral per §Files Expected
      to Change).
- [ ] `docs/ai/STATUS.md` updated with the WP-123 execution entry.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-123 row checked off
      with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-(next-slot) row set
      to `Done <date>`.
- [ ] No new npm dependencies added; `package.json` files unchanged
      across all workspaces.
- [ ] Commit prefix `EC-(next-slot):` per
      `docs/ai/REFERENCE/01.3-commit-hygiene-under-ec-mode.md`
      (never `WP-123:`).
- [ ] Manual smoke (optional): all ribbon pills behave unchanged from
      the pre-packet baseline.

---

## Lint-Gate Self-Review (per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`)

| §  | Topic                          | Disposition |
|----|--------------------------------|-------------|
| 1  | WP structure                   | PASS — all required sections present (Status, Dependencies, Session Context, Goal, Assumes, Context, Non-Negotiable Constraints, Vision Alignment, Funding Surface Gate, §21 API Catalog, Debuggability, Scope, Out of Scope, Files Expected to Change, Required Test Cases, Acceptance Criteria, Verification Steps, Definition of Done, Lint-Gate Self-Review). |
| 2  | Non-Negotiable Constraints     | PASS — engine-wide block intact; packet-specific block names sole files modified, locked contract values inline, session-protocol stop-and-ask clauses, required `// why:` comments. References `00.6-code-style.md`. Forbids partial output. |
| 3  | `## Assumes`                   | PASS — lists WP-086 / WP-122 deps + file-line assumptions + pre-session build/typecheck/test baselines + upstream data-gap assumption. |
| 4  | `## Context (Read First)`      | PASS — specific files cited with line ranges where relevant; ARCHITECTURE.md §Layer Boundary cited; `00.6-code-style.md` cited; DECISIONS.md scan instruction included; WP-086 §Out of Scope cited. |
| 5  | `## Files Expected to Change`  | PASS — ten files listed (four production, two governance new, four ledger), each with `— new` / `— modified` and a one-line description. Bounded (≤ 10 within reasonable ceiling). |
| 6  | Naming consistency             | PASS — `cardType: "sidekick"` / `"shield-agent"` matches existing taxonomy slugs in `data/metadata/card-types.json`; field names match `00.2-data-requirements.md`. No abbreviations (`entry`, `entryRecord`, not `o`/`ot`). |
| 7  | Dependency discipline          | PASS — no new npm dependency. Forbidden packages not introduced. |
| 8  | Architectural boundaries       | PASS — viewer-only fix; layer boundary preserved (no `game-engine`, `preplan`, `server`, `pg`, or `boardgame.io` imports added). |
| 9  | Windows compatibility          | PASS — Verification Steps use `pwsh`-style `Select-String`; paths use `\` separators in shell snippets. |
| 10 | Environment variable hygiene   | N/A — no env vars added or referenced. Justification: viewer correctness fix; data fetched via existing R2 config, no new env required. |
| 11 | Authentication clarity         | N/A — no auth surface touched. Justification: viewer correctness fix; no JWT, no session, no protected endpoint. |
| 12 | Test quality                   | PASS — new tests use `node:test` + `node:assert` strict only; no boardgame.io import; no network/DB access; deterministic in-memory fixtures. |
| 13 | Commands and verification      | PASS — every Verification Step is exact `pnpm` invocation or `Select-String` with expected output. |
| 14 | Acceptance criteria quality    | PASS — 11 binary, observable, specific items (within the 6–12 cap). |
| 15 | Definition of Done             | PASS — includes STATUS.md, DECISIONS.md, WORK_INDEX.md, EC_INDEX.md, and scope-boundary checks. |
| 16 | Code style                     | PASS — full English names (`entry`, `entryRecord`); JSDoc preserved on existing exports; comments explain WHY; no `.reduce()`; no `import *`; no terse error messages (no errors thrown in scope). |
| 17 | Vision Alignment               | PASS — §10a (Registry Viewer) cited; no NG-1..NG-7 crossed; determinism N/A with explicit justification. |
| 18 | Prose-vs-grep discipline       | PASS — Verification Steps grep targets are intended new code (`for (const entry of set.other)`, `${abbr}-${cardType}-${slug}`, `cardType:  string;`) and removed legacy patterns (`for (const o of set.other)`, `as unknown as FlatCardType[]`). No grep targets a forbidden token (`Math.random`, etc.). |
| 19 | Bridge-vs-HEAD staleness       | N/A — this WP is not a repo-state-summarizing artifact (no commit-history snapshot, no "Recent commits" enumeration, no STATUS-block draft). Reconciliation discipline applies at execution-commit time per the standard process, not at draft time. |
| 20 | Funding Surface Gate           | N/A — explicit one-line justification provided in §Funding Surface Gate above ("registry-viewer type-projection alignment + dispatch wire-through; no UI surfaces added, no user-visible copy added, no funding channels referenced"). |
| 21 | API Catalog Update             | N/A — explicit justification provided in §§21 API Catalog above ("viewer-only type-widening + dispatch fix; no `apps/server` files touched, no HTTP surface affected"). |

**Final gate:** PASS. Ready for user review and execution scheduling.
