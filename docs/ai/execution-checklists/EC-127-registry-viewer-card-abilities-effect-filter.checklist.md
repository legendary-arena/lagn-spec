# EC-127 — Registry Viewer: Card Abilities Effect-Tag Filter (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-125-registry-viewer-card-abilities-effect-filter.md`
**Layer:** Client UI (`apps/registry-viewer/`) + Registry schema (`packages/registry/src/schema.ts`)

> **Numbering note:** EC-127 is the next free EC slot after EC-126
> reserved WP-124 on 2026-05-01. Per the locked precedent (EC-103 →
> EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 → EC-122 → EC-123 →
> EC-124 → EC-125 → EC-126), the WP-keyed EC retargets to the next
> free slot that does not shadow a known or imminent WP — EC-127.
> The WP number (WP-125) is unchanged.

## §0 — Scope Model (Read Once)

This EC enforces **two distinct scopes**. They are not the same; do not
conflate them.

### A) Runtime / implementation scope (STRICT — 5 files)

Only these five production files may change:

1. `data/metadata/card-abilities.json` (new)
2. `packages/registry/src/schema.ts` (modified — additions only)
3. `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` (new)
4. `apps/registry-viewer/src/components/AbilityEffectFilter.vue` (new)
5. `apps/registry-viewer/src/App.vue` (modified)

Any other change under `apps/`, `packages/`, or `data/` is a **hard
abort** (see §Session Abort Conditions A).

### B) Total staged set (11 files at session close)

This execution closes WP-125 and records EC-127, so doc/ledger files
are also staged. The complete `git diff --name-only` output at session
end is expected to be exactly these **11** files — no more, no less:

1. `data/metadata/card-abilities.json`
2. `packages/registry/src/schema.ts`
3. `apps/registry-viewer/src/lib/cardAbilitiesClient.ts`
4. `apps/registry-viewer/src/components/AbilityEffectFilter.vue`
5. `apps/registry-viewer/src/App.vue`
6. `docs/ai/work-packets/WP-125-registry-viewer-card-abilities-effect-filter.md`
7. `docs/ai/execution-checklists/EC-127-registry-viewer-card-abilities-effect-filter.checklist.md`
8. `docs/ai/work-packets/WORK_INDEX.md`
9. `docs/ai/execution-checklists/EC_INDEX.md`
10. `docs/ai/DECISIONS.md`
11. `docs/ai/STATUS.md`

A 12th file under `apps/`, `packages/`, or `data/` is a runtime-scope
violation (§Session Abort Conditions A). A 12th file under `docs/`
(beyond the 6 ledger / doc files above) is a doc-scope violation
(§Session Abort Conditions A).

> **Staging discipline (read this before any `git add`).**
> Stage by **exact file path only**. Never use `git add .`,
> `git add -A`, or `git add -u`. The repo currently has at least one
> unrelated untracked file
> (`docs/ai/execution-checklists/EC-119-public-leaderboard-http-endpoints.checklist.md`,
> observed at WP-122 / WP-123 / WP-124 pre-flight 2026-05-01 and likely
> still untracked at WP-125 draft time) that an over-eager blanket-add
> would pull into this commit. Always pass each path explicitly to
> `git add`. The 11-file expected staged set in §0(B) is the sole
> authority on what may be staged. This is the single source of
> truth for staging discipline; §Guardrails references back here
> rather than restating. Placed early because over-eager staging is
> the most common execution failure mode.

> **Canonical decision (D-12501):**
> The Cards view exposes a curated effect-tag taxonomy that:
> - Lives in `data/metadata/card-abilities.json` (R2 path
>   `metadata/card-abilities.json`)
> - Schema is appended to `packages/registry/src/schema.ts`
>   (`CardAbilityMatcherSchema`, `CardAbilityEntrySchema`,
>   `CardAbilitiesIndexSchema`) with `.strict()` discipline mirroring
>   `CardTypeEntrySchema` (D-8601 precedent)
> - Matcher type is closed to `z.literal("regex")` for this WP;
>   adding any other matcher type is a deliberate follow-up WP
> - Slug regex enforces kebab-case (`^[a-z][a-z0-9-]*$`) at parse time
> - Initial taxonomy ships with exactly ten starter entries: `draw`,
>   `ko-from-hand`, `ko-from-discard`, `ko-from-hand-or-discard`,
>   `rescue-bystander`, `gain-attack`, `gain-recruit`, `gain-piercing`,
>   `gain-wound`, `defeat-villain`
> - Implemented as a second copy (not abstraction) of WP-086's
>   `cardTypesClient.ts` pattern — `cardTypesClient.ts` is
>   byte-identical pre- and post-execution
>
> All references below inherit from this decision; restated values
> are for executor convenience only — D-12501 is the source of
> truth.

> **Pre-merge R2 upload precondition.** `data/metadata/card-abilities.json`
> must be uploaded to
> `https://images.barefootbetters.com/metadata/card-abilities.json`
> **before** the commit lands on `main`. Production users who load
> `cards.barefootbetters.com` after the deploy and before the upload
> see the degraded path (chip ribbon hidden — silent absence, no
> visible error) but the path is still a regression of the locked
> behavior. Verify with `curl --head` (or a browser fetch) prior to
> merge. This precondition is enforced in §After Completing.

> **Testing note:** No tests are added in EC-127. Per the locked
> viewer-side precedent (WP-066 / WP-094 / WP-096 / WP-114 / WP-121 /
> WP-124), the registry-viewer has no Vue component-test harness at
> baseline; verification is build + typecheck + manual smoke only.
> The registry package's smoke test at
> `packages/registry/src/registry.smoke.test.ts` continues to pass
> green; the new schemas inherit incidental parse coverage via that
> test path. Test baselines preserved: viewer
> `tests 31 / suites 6 / pass 31 / fail 0`; registry green.
> Subsequent sections reference this note rather than restating.

---

## Before Starting

> **STOP** if any checkbox below is false.

- [ ] WP-086 merged: `apps/registry-viewer/src/lib/cardTypesClient.ts`
      exists with the singleton + `safeParse` + dot-joined-path warning
      + empty-array fallback shape; `data/metadata/card-types.json`
      exists with the 13-entry taxonomy; D-8601 records the
      reintroduction shape and the schema-subpath import discipline.
- [ ] WP-082 / WP-083 merged: glossary + theme R2 fetcher precedent
      established the `[<Domain>] Rejected …` warning shape and the
      `safeParse`-at-the-boundary discipline this packet inherits at
      one remove.
- [ ] WP-122 / WP-123 merged:
      `apps/registry-viewer/src/registry/shared.ts` `flattenSet()`
      populates `abilities: string[]` per FlatCard for every cardType;
      the file is byte-identical pre- and post-execution.
- [ ] `packages/registry/src/schema.ts` exports
      `CardTypeEntrySchema`, `CardTypesIndexSchema`, `CardTypeEntry`,
      `CardTypesIndex` at lines 213–224 (the insertion point for the
      new taxonomy block is immediately after these existing
      exports).
- [ ] `apps/registry-viewer/src/App.vue` cards-view filter region at
      lines 518–581 contains the existing search input, type-bar
      (lines 541–569), and set-pills (lines 572–581). The new chip
      ribbon mounts between the type-bar and the set-pills; no other
      filter-bar control exists at that mount point at session start.
- [ ] Baseline captured:
      `pnpm --filter registry-viewer build` exits 0,
      `pnpm --filter registry-viewer typecheck` exits 0,
      `pnpm --filter @legendary-arena/registry test` exits 0
      (registry smoke test green), and
      `pnpm --filter registry-viewer test` reports
      `tests 31 / suites 6 / pass 31 / fail 0` (locked post-EC-125
      baseline at `main` HEAD `919703f`, 2026-05-01). Post-session
      expectation: **UNCHANGED** at `31 / 6 / 31 / 0` (no tests
      added; the viewer has no Vue component-test harness at
      baseline).
- [ ] `cardTypesClient.ts`, `data/metadata/card-types.json`,
      `keywords-full.json`, `rules-full.json`, and `sets.json` are
      not edited by any parallel session (all five files are
      byte-identical pre- and post-execution per §Guardrails).
- [ ] No parallel session is editing
      `packages/registry/src/schema.ts`,
      `apps/registry-viewer/src/lib/`,
      `apps/registry-viewer/src/components/`, or
      `apps/registry-viewer/src/App.vue`'s cards-view region.

## Session Abort Conditions

Immediately ABORT (do not continue coding) if any condition below is
observed during execution.

### A) Scope violations (mechanical — checkable via `git diff --name-only`)

- Any edit is proposed to
  `apps/registry-viewer/src/lib/cardTypesClient.ts` (the cards-side
  reference fetcher; byte-identical lock — the *duplicate first*
  source).
- Any edit is proposed to `data/metadata/card-types.json`,
  `data/metadata/keywords-full.json`, `data/metadata/rules-full.json`,
  or `data/metadata/sets.json` (sibling metadata files; out-of-scope).
- Any edit is proposed to `packages/registry/src/shared.ts`,
  `packages/registry/src/impl/localRegistry.ts`,
  `packages/registry/src/impl/httpRegistry.ts`,
  `packages/registry/src/registry.smoke.test.ts`, or any other
  registry-package file beyond `packages/registry/src/schema.ts`
  (the registry-package's data-input-layer files are otherwise
  byte-identical lock per `.claude/rules/registry.md`
  §"Schema Authority" / §"Immutable Files").
- Any edit is proposed to
  `apps/registry-viewer/src/registry/shared.ts`,
  `apps/registry-viewer/src/registry/schema.ts`,
  `apps/registry-viewer/src/registry/types/`,
  `apps/registry-viewer/src/registry/browser.ts`, or
  `apps/registry-viewer/src/registry/impl/httpRegistry.ts` (the
  viewer's registry copy is byte-identical lock per WP-122 / WP-123
  conventions).
- Any edit is proposed under `packages/game-engine/**`,
  `packages/preplan/**`, `apps/server/**`, or `apps/arena-client/**`.
- Any edit is proposed to
  `apps/registry-viewer/src/composables/useCardSize.ts`,
  `apps/registry-viewer/src/composables/useThemeSize.ts` (if
  WP-124 has merged by execution time),
  `apps/registry-viewer/src/composables/useResizable.ts`,
  `apps/registry-viewer/src/composables/useCardViewMode.ts`,
  `apps/registry-viewer/src/composables/useGlossary.ts`, or
  `apps/registry-viewer/src/composables/useRules.ts` (adjacent
  composables; out-of-scope).
- Any other `.vue` file is edited beyond `AbilityEffectFilter.vue`
  and `App.vue` (e.g., `CardDetail.vue`, `CardGrid.vue`,
  `ThemeDetail.vue`, `ThemeGrid.vue`, `LoadoutBuilder.vue`,
  `LoadoutPreview.vue`, `HealthPanel.vue`, `GlossaryPanel.vue`,
  `ImageLightbox.vue`, `CardSizeSlider.vue`, `ThemeSizeSlider.vue`
  if WP-124 merged, `ViewModeToggle.vue` — all out-of-scope).
- Any additional file under `apps/`, `packages/`, or `data/`
  appears in `git diff --name-only` beyond the five files permitted
  in §0(A).
- Any additional doc file appears in `git diff --name-only` beyond
  the six ledger / doc files in §0(B) (positions 6–11).

### B) Semantic violations

- The schema-export names are anything other than the locked verbatim
  set: `CardAbilityMatcherSchema`, `CardAbilityEntrySchema`,
  `CardAbilitiesIndexSchema`, plus the inferred type aliases
  `CardAbilityMatcher`, `CardAbilityEntry`, `CardAbilitiesIndex`.
- The matcher schema's `type` field is anything other than
  `z.literal("regex")` (e.g., `z.enum([...])`, `z.string()`,
  multiple literals union). The single-literal lock is intentional
  per Canonical decision (D-12501); a future second matcher type
  is a deliberate follow-up WP.
- Any new schema object omits `.strict()`. All three new object
  schemas (matcher, entry, index-entry-shape) use `.strict()` to
  reject unknown fields, mirroring `CardTypeEntrySchema:213–219`
  exactly.
- The slug regex on `CardAbilityEntrySchema.slug` is anything other
  than `/^[a-z][a-z0-9-]*$/` (kebab-case, leading lower-alpha,
  no underscores, no uppercase, no leading digit).
- The `matchers` field is `z.array(...)` without `.min(1)` (an
  entry with zero matchers is not useful and would silently drop
  during apply; locked at `.min(1)`).
- The fetcher exports anything other than the locked two symbols
  (`getCardAbilities`, `buildAbilityTagIndex`). Adding
  `resetCardAbilities`, `_promise`, or any other named export is
  a FAIL (the symmetric `resetCardTypes` was added under EC-104 for
  a specific test-harness need not present in this WP).
- `buildAbilityTagIndex` reads any module-scope state, throws,
  performs I/O, mutates `cards`, mutates `taxonomy`, or returns
  non-deterministic output for identical inputs.
- The duplicate-slug post-parse filter is missing or warns more than
  once per duplicate slug (locked at one dedup'd warn per slug,
  second-and-later entries dropped).
- Duplicate-slug warnings emitted by the post-parse filter must use
  the `[CardAbilities]` prefix and must include the offending `slug`
  literal in the message. Freeform wording is permitted beyond
  those two anchors. This keeps log lines greppable by domain prefix
  (parallel to `[CardTypes]`, `[Glossary]`, `[Themes]`) and by slug
  without over-specifying the rest of the message.
- `AbilityEffectFilter.vue` exposes any prop or event beyond the
  locked contract (one required prop `taxonomy`, one optional prop
  `tagIndex`, one v-model `selectedEffectSlugs`, one event
  `update:selectedEffectSlugs`). Adding lifecycle hooks, fetching
  from inside the component, or importing a glossary client is a
  FAIL.
- The component renders an empty-ribbon shell when
  `taxonomy.length === 0` (locked at degraded-mode invisibility —
  `v-if="taxonomy.length > 0"` on the outer wrapper, no placeholder).
- `cardTypesClient.ts` is parameterized, refactored into a shared
  base, or otherwise modified — the *duplicate first* lock is
  preserved byte-identical until a third taxonomy fetcher arrives.
- The chip ribbon mounts anywhere other than between the type-bar
  and the set-pills in the cards-view filter region (e.g., in
  `header-actions`, in the themes-view filter bar, in the loadout
  view, inside `CardGrid.vue` itself).
- `applyQuery()` (in `apps/registry-viewer/src/registry/shared.ts`)
  is called with an `abilityEffectsAny` field, or `shared.ts` is
  modified to know about effect tags. The abilities filter is a
  viewer-local post-step on `applyQuery()` results — `shared.ts`
  stays pure of taxonomy-derived concepts.
- `card-abilities.json` contains anything other than ten entries at
  initial commit. More or fewer at this commit is a §Files Expected
  to Change scope violation (operator may upload an extended file to
  R2 separately, but the committed file ships with exactly the ten
  locked starter entries).
- The fetched URL path is anything other than
  `${metadataBaseUrl}/metadata/card-abilities.json`.
- The OR-within / AND-without filter composition is inverted: a card
  must match ANY selected effect's tag (OR), but must also satisfy
  every other filter (set, hero class, card type, search) — the
  existing AND-with-other-filters semantics are preserved.
- The tag index is recomputed on filter selection (locked at one
  build per session, after both registry and taxonomy resolve).
- Test count is anything other than `31 / 6 / 31 / 0`. No tests
  added; baseline is preserved.

## Locked Values (do not re-derive)

- **Production files modified (verbatim):**
  - `data/metadata/card-abilities.json` (new)
  - `packages/registry/src/schema.ts` (modified — additions only)
  - `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` (new)
  - `apps/registry-viewer/src/components/AbilityEffectFilter.vue` (new)
  - `apps/registry-viewer/src/App.vue` (modified)
- **R2 metadata path (verbatim):** `metadata/card-abilities.json`.
- **Schema export names (verbatim):**
  `CardAbilityMatcherSchema`, `CardAbilityEntrySchema`,
  `CardAbilitiesIndexSchema`, `CardAbilityMatcher`,
  `CardAbilityEntry`, `CardAbilitiesIndex`.
- **Matcher schema type field (verbatim):**
  `type: z.literal("regex")`.
- **Slug regex (verbatim):** `/^[a-z][a-z0-9-]*$/`.
- **Matchers array (verbatim):**
  `matchers: z.array(CardAbilityMatcherSchema).min(1)`.
- **All three new object schemas use** `.strict()` at the entry
  boundary.
- **Fetcher export signatures (verbatim):**
  `export function getCardAbilities(metadataBaseUrl: string): Promise<CardAbilityEntry[]>`
  and
  `export function buildAbilityTagIndex(cards: readonly FlatCard[], taxonomy: readonly CardAbilityEntry[]): Map<string, Set<string>>`.
- **Component import path in `App.vue` (verbatim):**
  `from "./components/AbilityEffectFilter.vue";`
- **Client import path in `App.vue` (verbatim):**
  `from "./lib/cardAbilitiesClient";`
- **Type import in `App.vue` (verbatim):**
  `from "@legendary-arena/registry/schema";`
- **Schema import path in `cardAbilitiesClient.ts` (verbatim):**
  `from "@legendary-arena/registry/schema";` (narrow subpath, NOT
  the barrel — D-8601 binding).
- **State refs in `App.vue` (verbatim):**
  `const abilitiesTaxonomy = ref<CardAbilityEntry[]>([]);`
  `const abilityTagIndex = ref<Map<string, Set<string>> | null>(null);`
  `const selectedEffectSlugs = ref<Set<string>>(new Set());`
- **Initial ten effect-tag entries (verbatim slugs and labels;
  emojis indicative, operator may swap during file authoring):**
  1. `draw` — *Draw a card*
  2. `ko-from-hand` — *KO from hand*
  3. `ko-from-discard` — *KO from discard*
  4. `ko-from-hand-or-discard` — *KO from hand or discard*
  5. `rescue-bystander` — *Rescue a Bystander*
  6. `gain-attack` — *Gain Attack*
  7. `gain-recruit` — *Gain Recruit*
  8. `gain-piercing` — *Gain Piercing*
  9. `gain-wound` — *Gain a Wound*
  10. `defeat-villain` — *Defeat a Villain*
- **Default matcher flags (apply-time only — not in the JSON):**
  `"i"` (case-insensitive). Operator-supplied empty-string flags
  field is respected as opt-out for case-sensitive matching.
- **Mount point for the chip ribbon:** between the existing
  `<div class="type-bar">` (`App.vue` cards-view filter region,
  pre-session lines 541–569) and the existing
  `<div class="set-pills">` (pre-session lines 572–581).
- **Filter composition (verbatim):** OR within selected effect chips
  (a card matches if ANY selected effect's tag is present);
  AND with every other filter (set / hero class / card type / search
  — existing `applyQuery()` semantics preserved).
- **Tag-index build cadence:** exactly once per session, after both
  `getRegistry()` and `getCardAbilities()` resolve. Subsequent
  filter selections consult the Map without recomputing.
- **Pre-session test baselines (verbatim):**
  registry-viewer: `tests 31 / suites 6 / pass 31 / fail 0` (locked
  post-EC-125 at `main` HEAD `919703f`, 2026-05-01).
  Registry package: green at the same `main` HEAD.
- **Post-session test baselines (verbatim):** UNCHANGED — no tests
  added in this WP; both baselines preserved.

## Guardrails

- **Five-file production scope.** Only the five files in §0(A) are
  edited. Any other file outside that set (governance ledgers
  excluded — see §0(B)) is a scope violation.
- **Stage by exact file path only.** See the staging-discipline
  callout immediately after §0 Scope Model — that callout is the
  single source of truth for staging discipline; do not re-derive.
- **Duplicate, do not abstract.** `cardAbilitiesClient.ts` is
  structurally a copy of `cardTypesClient.ts` with ability-prefixed
  names — same singleton + `devLog` start / failed / complete events,
  same HTTP `!response.ok` empty-array fallback, same `safeParse`
  with dot-joined-path warning, same terminal `try/catch` swallow
  shape. Differences: ability-prefixed names, the post-parse
  duplicate-slug filter (parallel to cardTypes' orphan-parentType
  filter), and the additional `buildAbilityTagIndex` pure helper
  (justified by per-card derived form not present in card-types).
  **No `cardTypesClient.ts` imports from `cardAbilitiesClient.ts`
  and vice versa.** No shared base file. No helper extraction.
- **Schema additions only.** `packages/registry/src/schema.ts`
  appends three new object schemas, one array schema, and three
  type aliases. **No existing schema is renamed, removed, re-typed,
  or re-positioned.** The card-types block (lines 205–224 in current
  `main`), the glossary blocks (lines 178–203), and every other
  existing block are byte-identical pre- and post-execution.
- **Matcher type closed.** The matcher schema's `type` field is
  `z.literal("regex")` — single literal, not an enum. Adding any
  other matcher type (substring, token-presence, structured) is a
  deliberate follow-up WP that updates both the schema and the
  apply-time switch in `buildAbilityTagIndex`.
- **`buildAbilityTagIndex` is pure.** No I/O, no module-scope
  reads, no throws, no input mutation, no output mutation. Regex
  compilation happens once per matcher per call and is reused
  across every card scanned. Identical inputs produce identical
  outputs.
- **No edits to:** `cardTypesClient.ts`, `card-types.json`,
  `keywords-full.json`, `rules-full.json`, `sets.json`,
  `apps/registry-viewer/src/registry/shared.ts`,
  `apps/registry-viewer/src/registry/schema.ts`,
  `apps/registry-viewer/src/registry/types/`,
  `apps/registry-viewer/src/registry/browser.ts`,
  `apps/registry-viewer/src/registry/impl/httpRegistry.ts`,
  `packages/registry/src/shared.ts`,
  `packages/registry/src/impl/localRegistry.ts`,
  `packages/registry/src/impl/httpRegistry.ts`,
  `packages/registry/src/registry.smoke.test.ts`,
  `useCardSize.ts`, `useResizable.ts`, `useCardViewMode.ts`,
  `useGlossary.ts`, `useRules.ts`, `useSetupFromUrl.ts`,
  `useLightbox.ts`, `useLoadoutDraft.ts`, any `.test.ts` file.
- **No new npm dependencies; no `package.json` change in any
  workspace.**
- **No tests added; no test config change; no `.test.ts` file
  created.** Test baselines preserved — viewer
  `31 / 6 / 31 / 0`; registry green.
- **No imports from** `boardgame.io`,
  `@legendary-arena/{game-engine,preplan,server}`, `pg`, the
  Node-bearing `@legendary-arena/registry` barrel (use the narrow
  `@legendary-arena/registry/schema` subpath; D-8601 binding), or
  any `node:` built-in.
- **`shared.ts` stays pure of effect-tag concepts.** The abilities
  filter is applied as a viewer-local post-step in `App.vue` on
  the `applyQuery()` result. Do not extend
  `apps/registry-viewer/src/registry/shared.ts` `applyQuery()` with
  an `abilityEffectsAny` field — that file is byte-identical lock.
- **The taxonomy fetch is non-blocking.** HTTP failure or schema
  rejection resolves to `[]`; the chip ribbon stays hidden via
  `v-if="abilitiesTaxonomy.length > 0"` on the component instance.
  Card view remains fully functional in degraded mode.
- **Tag-index rebuild discipline.** The Map is built exactly once
  after both `getRegistry()` and `getCardAbilities()` resolve.
  Subsequent filter operations consult the Map; never recompute
  during a chip toggle, search keystroke, or set-filter change.
- **Slug regex enforced at parse time.** Any operator-authored
  entry that violates `/^[a-z][a-z0-9-]*$/` is rejected by Zod with
  a full-sentence `[CardAbilities] Rejected …` warning; the
  fetcher returns `[]` and the chip ribbon stays hidden.
- **Duplicate-slug discipline.** Two entries with identical `slug`
  values: one dedup'd warn per duplicate slug, the
  second-and-later entries are dropped from the returned array
  (parallel to cardTypes' orphan-parentType filter).
- **No refactor or formatting churn** outside the five files in §0(A)
  or the governance ledgers in §0(B). The cards-view filter region's
  search input, type-bar, set-pills, and `CardSizeSlider` are
  byte-identical pre- and post-execution; only a single new
  `<AbilityEffectFilter />` element is inserted between the type-bar
  and the set-pills.
- **No `// why:` churn** outside the new files and the new insertion
  points in `App.vue` (the `getCardAbilities()` await, the
  `buildAbilityTagIndex` call, the post-`applyQuery()` filter step).

## Required `// why:` Comments

All **eleven** clauses below are mandatory. Missing any clause is an
EC fail. (The schema-block header counts as the first clause; the
remaining ten span the client, the component, and `App.vue`.)

- **`packages/registry/src/schema.ts` block header for the new
  taxonomy:** WP-125 second metadata-driven taxonomy under WP-086
  precedent; `.strict()` rejects unknown fields so any future
  pipeline drift surfaces as an explicit Zod error rather than
  silent data loss; the matcher type is locked to a single literal
  (`"regex"`) so adding a future matcher type is an explicit schema
  decision; D-12501 records the lock.
- **`cardAbilitiesClient.ts` module-header JSDoc:** mirrors
  `cardTypesClient.ts` line-for-line per the *duplicate first*
  rule; the singleton promise is module-scope (one fetch per
  session); `safeParse` at the boundary degrades to an empty array
  on HTTP failure or schema rejection (never throws — non-blocking
  by design, same posture as `cardTypesClient.ts`);
  `buildAbilityTagIndex` is a pure helper that compiles each
  matcher's regex once and applies it to every card's abilities
  array.
- **`cardAbilitiesClient.ts` on the schema-subpath import:** the
  import path is the narrow `@legendary-arena/registry/schema`
  subpath, citing D-8601 verbatim by ID (per §18 prose-vs-grep
  discipline — do NOT enumerate forbidden modules in this prose).
- **`cardAbilitiesClient.ts` on the matcher-flags default:**
  omitted `flags` defaults to `"i"` (case-insensitive) at apply
  time because card-text capitalization is inconsistent
  ("KO" / "Ko" / "ko"); an explicit empty-string `flags` field
  disables the default (operator opt-out for cases requiring case
  sensitivity).
- **`cardAbilitiesClient.ts` on the regex compilation site:**
  compilation happens once per matcher per call (not per card) to
  avoid quadratic regex-engine setup cost across ~3000 cards ×
  ~10 matchers × 1–3 patterns each.
- **`cardAbilitiesClient.ts` on the duplicate-slug post-parse
  filter:** Zod cannot express cross-element uniqueness; the
  invariant is enforced post-parse with one dedup'd warn per
  offending slug and second-and-later entries dropped, parallel to
  `cardTypesClient.ts`'s orphan-parentType filter
  (`cardTypesClient.ts:88–110`).
- **`cardAbilitiesClient.ts` on any `try/catch` swallow:**
  full-sentence swallow per 00.6 Rule 11; identical in shape to
  `cardTypesClient.ts:118–129`; never throws (non-blocking
  contract; degraded path is empty-array return).
- **`AbilityEffectFilter.vue` module-header JSDoc:** the ribbon is
  purely a presentational chip-toggle component (taxonomy flows
  in via prop, selection flows out via
  `update:selectedEffectSlugs`, the tag index is consulted only
  for badge counts); the component performs no fetching of its
  own; it stays hidden when the taxonomy is empty (degraded-mode
  invisibility rather than a visible empty ribbon).
- **`App.vue` on the `getCardAbilities()` call site:** the fetch
  is parallel to the cardTypes / glossary fetches; the client is
  non-blocking (resolves to `[]` on failure); the chip ribbon is
  silently absent when the taxonomy is empty.
- **`App.vue` on the `buildAbilityTagIndex` call site:** the index
  is built once after both registry and taxonomy resolve; keyed by
  `card.key` (the `${abbr}-${cardType}-${slug}` string established
  by WP-122); subsequent filter selections consult the index
  without recomputing.
- **`App.vue` on the post-`applyQuery()` filter step:** the
  abilities filter is applied *after* `applyQuery()` rather than
  inside it because `applyQuery()` belongs to
  `apps/registry-viewer/src/registry/shared.ts` (the registry
  package's per-viewer flatten copy) and an effect-tag concept is
  out of scope for that helper; keeping the filter outside
  preserves the helper's purity.


## Files to Produce

- `data/metadata/card-abilities.json` — **new** — ten starter
  effect-tag entries, two-space indent, trailing newline; validated
  locally against `CardAbilitiesIndexSchema` before commit.
- `packages/registry/src/schema.ts` — **modified** — appends
  `CardAbilityMatcherSchema`, `CardAbilityEntrySchema`,
  `CardAbilitiesIndexSchema`, `CardAbilityMatcher`,
  `CardAbilityEntry`, `CardAbilitiesIndex` after the existing
  card-types block. No other change.
- `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` — **new** —
  singleton fetcher (`getCardAbilities`) plus pure helper
  (`buildAbilityTagIndex`); two exports total; mirrors
  `cardTypesClient.ts` shape line-for-line for the fetcher portion.
- `apps/registry-viewer/src/components/AbilityEffectFilter.vue` —
  **new** — chip-toggle ribbon component with v-model, taxonomy
  prop, optional tag-index prop, scoped CSS; renders nothing when
  taxonomy is empty.
- `apps/registry-viewer/src/App.vue` — **modified** — three new
  imports, three new top-level refs, one new fetch in `onMounted`,
  one modified `applyFilters` body (post-`applyQuery()` filter
  step), one extended `clearAllFilters` (resets
  `selectedEffectSlugs`), one new template mount between type-bar
  and set-pills (with `v-if` on taxonomy length).
- Governance at session close (positions 6–11 of the §0(B) staged
  set, not counted against §0(A)'s 5-file runtime scope):
  `STATUS.md` block; `DECISIONS.md` D-12501 entry;
  `WORK_INDEX.md` WP-125 `[ ]` → `[x]`; `EC_INDEX.md` EC-127 Draft →
  Done; the WP and EC files themselves.

## After Completing

> ⚠️ **Merge Blocker — R2 upload precondition.**
> If `metadata/card-abilities.json` is not present at
> `https://images.barefootbetters.com/metadata/card-abilities.json`
> prior to merge, **DO NOT LAND THE COMMIT**. Verify with
> `curl --head` (200 OK) before pushing. Degraded mode (chip ribbon
> hidden via the `v-if="abilitiesTaxonomy.length > 0"` guard) is
> acceptable temporarily, but a post-merge upload is a regression of
> a locked behavior. See §0 callouts and the explicit verification
> step further down this list — both gate the same precondition; this
> banner exists to surface it under time pressure.

- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter registry-viewer typecheck` exits 0.
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
      (registry smoke test green; new schemas do not break the
      parse path).
- [ ] `pnpm --filter registry-viewer test` reports
      `tests 31 / suites 6 / pass 31 / fail 0` (UNCHANGED). Any
      change in test count, suite count, or fail count is a FAILED
      criterion.
- [ ] `git diff apps/registry-viewer/src/lib/cardTypesClient.ts` →
      no output.
- [ ] `git diff data/metadata/card-types.json` → no output.
- [ ] `git diff data/metadata/keywords-full.json` → no output.
- [ ] `git diff data/metadata/rules-full.json` → no output.
- [ ] `git diff data/metadata/sets.json` → no output.
- [ ] `git diff apps/registry-viewer/src/registry/` → no output
      (entire viewer-registry directory is byte-identical lock).
- [ ] `git diff packages/registry/src/shared.ts` → no output.
- [ ] `git diff packages/registry/src/impl/` → no output.
- [ ] `git diff packages/registry/src/registry.smoke.test.ts` →
      no output.
- [ ] `git diff apps/registry-viewer/package.json` → no output.
- [ ] `git diff packages/registry/package.json` → no output.
- [ ] `git diff --name-only` lists exactly the 11 files in §0(B), no
      more, no less. Any additional file under `apps/`, `packages/`,
      or `data/` is a §0(A) runtime-scope violation; any additional
      file under `docs/` is a §0(B) doc-scope violation. Both are
      FAILED criteria — see §Session Abort Conditions A.
- [ ] `Select-String -Path "packages\registry\src\schema.ts" -Pattern "CardAbilityMatcherSchema = z.object"`
      returns exactly one match.
- [ ] `Select-String -Path "packages\registry\src\schema.ts" -Pattern "CardAbilityEntrySchema = z.object"`
      returns exactly one match.
- [ ] `Select-String -Path "packages\registry\src\schema.ts" -Pattern "CardAbilitiesIndexSchema = z.array"`
      returns exactly one match.
- [ ] `Select-String -Path "packages\registry\src\schema.ts" -Pattern 'z\.literal\("regex"\)'`
      returns exactly one match (the matcher type lock).
- [ ] `Select-String -Path "packages\registry\src\schema.ts" -Pattern "CardTypeEntrySchema = z.object"`
      returns exactly one match (existing card-types schema is
      byte-identical pre- and post-execution).
- [ ] `Select-String -Path "apps\registry-viewer\src\lib\cardAbilitiesClient.ts" -Pattern "export function getCardAbilities"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\lib\cardAbilitiesClient.ts" -Pattern "export function buildAbilityTagIndex"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\lib\cardAbilitiesClient.ts" -Pattern "@legendary-arena/registry/schema"`
      returns at least one match (the narrow-subpath import).
- [ ] `Select-String -Path "apps\registry-viewer\src\components\AbilityEffectFilter.vue" -Pattern 'v-if="taxonomy\.length'`
      returns at least one match (the degraded-mode invisibility
      guard on the outer wrapper).
- [ ] `Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "<AbilityEffectFilter"`
      returns exactly one match (the template instance).
- [ ] `Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "import AbilityEffectFilter"`
      returns exactly one match (the import statement).
- [ ] `Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "import \{ getCardAbilities, buildAbilityTagIndex \}"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "buildAbilityTagIndex\("`
      returns exactly one match. Confirms the index is built exactly
      once per session inside `onMounted` (after both `getRegistry()`
      and `getCardAbilities()` resolve) and never recomputed during a
      chip toggle, search keystroke, or set-filter change. A second
      match indicates the call leaked into `applyFilters` or another
      reactive seam — see Common Failure Smells.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"draw"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"ko-from-hand"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"ko-from-discard"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"ko-from-hand-or-discard"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"rescue-bystander"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"gain-attack"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"gain-recruit"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"gain-piercing"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"gain-wound"'`
      returns exactly one match.
- [ ] `Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"defeat-villain"'`
      returns exactly one match.
- [ ] One-shot schema parse smoke (run from repo root):
      `node -e "const fs=require('node:fs'); const raw=JSON.parse(fs.readFileSync('data/metadata/card-abilities.json','utf8')); if (raw.length !== 10) throw new Error('expected 10 entries, got '+raw.length); const slugs=new Set(); for (const e of raw) { if (slugs.has(e.slug)) throw new Error('duplicate slug: '+e.slug); slugs.add(e.slug); if (!/^[a-z][a-z0-9-]*$/.test(e.slug)) throw new Error('invalid slug: '+e.slug); if (!Array.isArray(e.matchers) || e.matchers.length === 0) throw new Error('missing matchers: '+e.slug); for (const m of e.matchers) { if (m.type !== 'regex') throw new Error('non-regex matcher: '+e.slug); new RegExp(m.pattern, m.flags || 'i'); } } console.log('OK: 10 entries, all slugs unique, all matchers valid regex');"`
      → exits 0; stdout includes "OK: 10 entries…".
- [ ] **Pre-merge R2 upload verification.** Upload
      `data/metadata/card-abilities.json` to
      `https://images.barefootbetters.com/metadata/card-abilities.json`.
      Verify with
      `curl --head https://images.barefootbetters.com/metadata/card-abilities.json`
      that the response status is 200 OK and `Content-Type` is
      `application/json` (or matches the existing `card-types.json`
      content-type at the same path).
- [ ] Manual smoke (optional, not gated) on
      `pnpm --filter registry-viewer dev`:
      ten effect chips visible in cards-view between type-bar and
      set-pills; clicking "Draw a card" filters grid to draw-tagged
      cards; multi-select OR works (both effect chips active widens
      the result); combining with hero-class filter narrows correctly
      (AND with other filters); clearing all filters resets the chip
      selection; rename `card-abilities.json` on R2 to force 404 →
      reload → chip ribbon silently absent, card view fully
      functional, only `[CardAbilities] Rejected …` or `load failed`
      warning in console; restore the file → reload → ribbon
      reappears.
- [ ] `docs/ai/STATUS.md` updated — registry viewer cards-view now
      exposes a curated effect-tag chip ribbon driven by
      `data/metadata/card-abilities.json`; existing card-types
      ribbon, set-pills, search, and hero-class filter unchanged
      (independent state); test baselines UNCHANGED.
- [ ] `docs/ai/DECISIONS.md` updated — D-12501 (locked taxonomy
      file path, schema names, matcher single-literal lock, slug
      regex `/^[a-z][a-z0-9-]*$/`, initial ten-entry baseline,
      `.strict()` discipline, narrow-subpath import binding;
      cites *duplicate first* and D-8601 / D-1203 as precedents).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-125 row checked off
      with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-127 row set to
      `Done <date>`.

## Common Failure Smells

- **Symptom:** Chip ribbon shows up empty (visible shell, no chips)
  → the `v-if="taxonomy.length > 0"` guard was placed on the inner
  loop instead of the outer wrapper; the locked discipline is
  degraded-mode invisibility (no shell at all). Move the guard to
  the component's outermost render element.
- **Symptom:** Selecting "Draw a card" filters to far too many
  cards (e.g., 200+) → the matcher regex is too loose (likely
  matching "drawn" or "Draw deck" in unrelated phrasing). Tighten
  the regex (e.g., `\bdraw (a|one|two|three|\d+) cards?\b`) rather
  than relaxing the entry; never use a bare `\bdraw\b`.
- **Symptom:** Selecting "KO from hand" matches a card whose text
  says "from the KO pile" → the `\bKO\b` portion lacks a hand /
  discard / specific-zone anchor. Restore the locked anchor pattern
  (`\bKO [a-z ]*from your hand\b`) and re-test.
- **Symptom:** Two chips selected, count drops to zero → the filter
  is computing AND across chips instead of OR. The locked semantics
  are OR-within-the-abilities-filter (a card matches if ANY selected
  effect's tag is present); only the composition with other filters
  is AND. Re-read the post-`applyQuery()` filter loop: a `for...of`
  over `selected` with an early `return true` on first hit, falling
  through to `return false`.
- **Symptom:** Chip-ribbon clicks don't update the grid → the
  `@update:selectedEffectSlugs` handler on the component instance
  in `App.vue` is missing or doesn't call `applyFilters`. The chip
  v-model updates the ref, but the post-`applyQuery()` filter only
  runs when `applyFilters` is called.
- **Symptom:** Filter state persists across reloads → the locked
  contract has NO localStorage persistence for chip selection (per
  WP-125 §Out of Scope). Verify no `localStorage.setItem` /
  `getItem` calls touch `selectedEffectSlugs`. (If a future WP adds
  persistence parallel to `cardGridSize`, that's a deliberate
  decision — not in scope here.)
- **Symptom:** Tag-index Map is empty for every card → the matcher
  regex was authored against the tokenized form (`[keyword:Heist]`)
  rather than the rendered prose. The tag index runs against
  `card.abilities` strings *as stored*, including the
  `[keyword:X]`, `[icon:Y]`, `[hc:Z]` markup. Authoring discipline:
  match either the prose surface ("Draw a card") OR the token
  surface (`\[icon:attack\]`), not a hypothetical post-rendered
  form.
- **Symptom:** Schema rejection on R2 publish ("Rejected …
  /0/matchers/0/type") → the matcher entry has `"type": "substring"`
  or any value other than `"regex"`. The schema is locked at
  `z.literal("regex")` for this WP; substring / token matchers are
  a deliberate follow-up WP.
- **Symptom:** Schema rejection on slug → the slug contains an
  underscore, capital letter, or leading digit. Locked regex is
  `/^[a-z][a-z0-9-]*$/`. Restore kebab-case.
- **Symptom:** Tag index is rebuilt on every chip toggle (visible
  console spam from a `devLog` left in place) → the
  `buildAbilityTagIndex` call leaked into `applyFilters`. The
  locked discipline is one build per session inside `onMounted`,
  after both `getRegistry()` and `getCardAbilities()` resolve.
- **Symptom:** TypeScript reports a type error on the
  `selectedEffectSlugs` v-model → the v-model declaration in
  `AbilityEffectFilter.vue` uses `defineModel` (Vue 3.4+ macro);
  ensure the project's Vue version supports `defineModel`. If not,
  fall back to explicit `defineProps` /
  `defineEmits('update:selectedEffectSlugs')` parallel pair (the
  `App.vue` template binding is `v-model:selected-effect-slugs`
  either way).
- **Symptom:** `applyQuery()` was modified — `git diff
  apps/registry-viewer/src/registry/shared.ts` shows changes →
  Session Abort Condition A. The viewer-registry copy is
  byte-identical lock; the abilities filter is a viewer-local
  post-step in `App.vue`. Revert `shared.ts`.
- **Symptom:** A 12th file appears in `git diff --name-only` →
  Session Abort Condition A. The five-file production lock is
  intentional. Re-read §0(A) (runtime / implementation scope) vs
  §0(B) (total staged set) to identify which scope was violated.
  Common cause: an over-eager `git add -A` or `git add .`
  (forbidden — see §0 Staging discipline callout).
- **Symptom:** `git diff apps/registry-viewer/src/lib/cardTypesClient.ts`
  shows changes → the cards-side fetcher was edited (likely an
  attempt to refactor into a shared base). Revert. The
  *duplicate first* lock is preserved byte-identical until a third
  taxonomy fetcher arrives.
- **Symptom:** `curl --head https://images.barefootbetters.com/metadata/card-abilities.json`
  returns 404 after the commit lands on `main` → the pre-merge R2
  upload precondition was skipped. Production users see degraded
  mode (chip ribbon hidden) until the upload completes. Upload
  immediately and verify with another `curl --head`.
- **Symptom:** Eleven `// why:` clauses are not all present →
  re-read §Required `// why:` Comments; all eleven are mandatory
  (the schema header counts as one). Missing any clause is an EC
  fail.
- **Symptom:** Schema parse smoke (`node -e` in §After Completing)
  reports "expected 10 entries, got N" → the initial taxonomy was
  authored with the wrong count. Locked at exactly ten starter
  entries for this commit; uploading more to R2 separately is
  permitted but the committed file ships at exactly ten.
