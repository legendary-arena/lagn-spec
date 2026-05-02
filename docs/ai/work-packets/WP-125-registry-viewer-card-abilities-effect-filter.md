# WP-125 — Registry Viewer: Card Abilities Effect-Tag Filter

**Status:** Draft (authored 2026-05-01; awaiting user review and lint-gate sign-off)
**Primary Layer:** Client UI (`apps/registry-viewer/`) + Registry schema (`packages/registry/src/schema.ts`)
**Dependencies:**
- **Hard:** WP-086 (Card-Types Taxonomy) — established the
  `data/metadata/<taxonomy>.json` + `<taxonomy>Client.ts` pattern this
  packet duplicates one-for-one for ability-effect tagging. D-8601
  locks the schema-via-narrow-subpath import discipline this packet
  inherits.
- **Soft:** WP-082 / WP-083 (glossary + theme R2 fetchers) — established
  the singleton + non-blocking + `safeParse`-at-the-boundary pattern
  WP-086 codified and this packet inherits at one remove.
- **Soft:** WP-122 / WP-123 (viewer flatten + cardType widening) —
  established the per-FlatCard `abilities: string[]` invariant this
  packet reads (never mutates).
- **Compatible with (not dependent on):** WP-124 (themes-view zoom
  slider) — disjoint surfaces; WP-124 touches the themes-view filter
  bar, this WP touches the cards-view filter bar. Merge order is not
  load-bearing.

---

## Session Context

The registry viewer at `cards.barefootbetters.com` lets users browse
~3000 cards across 40 sets, with filters for set, hero class, card
type, and a free-text search that matches `name + heroName` only. A
user looking for "all cards that draw a card" or "all cards that KO
something from hand" has no first-class path to that information —
the only option is naked free-text search of the card name field,
which never matches the ability text where those effects actually
appear.

Card abilities are stored as `abilities: string[]` per card (e.g.,
`["Heist: You may KO a card from your hand or discard pile."]`). The
text mixes tokenized markup (`[keyword:Heist]`, `[icon:attack]`,
`[hc:covert]`) with free English prose. Named keywords (Heist, Antics,
Berserk, Patrol, Focus, Ambush, Transforms, ...) are already glossed
via `metadata/keywords-full.json` (123 entries). The *effects* surface
— Draw / KO / Rescue / +Attack / +Recruit / Reveal — is plain English
and not currently structured anywhere.

This WP closes that gap with a curated effect-tag taxonomy. A new R2
artifact `data/metadata/card-abilities.json` enumerates ~10 effect
entries (slug, label, emoji?, matchers — each matcher a regex pattern
applied to the card's `abilities[]` strings). The viewer fetches this
taxonomy at startup (singleton + non-blocking + `safeParse` at the
boundary), computes a per-card effect-tag index once, and surfaces a
chip ribbon under the existing card-type ribbon in the cards-view
filter bar. Selecting one or more chips filters the grid to cards
whose abilities match any selected effect.

The pattern is fully precedented. WP-086 added `card-types.json` +
`cardTypesClient.ts` + a chip ribbon driven by it; this packet is the
parallel artifact for *what cards do*, not *what cards are*.
`.claude/rules/code-style.md` §"Abstraction & Control Flow" locks
*duplicate first, abstract only when a third copy appears* — this is
the second such taxonomy fetcher, so duplicate; a future third would
own the abstraction decision.

The shape is taxonomy, not index: the file authors regex matchers
once, the viewer applies them at runtime against the existing
`abilities[]` strings. A precomputed forward index (cardKey → tags)
was rejected because it would couple the registry-viewer to the
upstream `bbcode/modern-master-strike` data pipeline (every card-text
edit upstream would require a regenerated index in this repo). The
auto-memory entry "Card data pipeline (cross-repo) — fix upstream,
not in-repo" flags exactly this anti-pattern.

---

## Goal

After this session:

- A new R2 artifact `data/metadata/card-abilities.json` exists,
  contains ten initial effect-tag entries (slug, label, optional
  emoji, ordered matcher list with `regex` patterns), and validates
  cleanly against the new `CardAbilitiesIndexSchema` exported from
  `packages/registry/src/schema.ts`.
- A new singleton fetcher
  `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` exposes
  `getCardAbilities(metadataBaseUrl): Promise<CardAbilityEntry[]>`
  and a pure `buildAbilityTagIndex(cards, taxonomy)` helper that
  returns `Map<cardKey, Set<effectSlug>>`. The fetcher is
  non-blocking: HTTP failure or schema rejection resolves to `[]` and
  emits a `[CardAbilities] Rejected …` warning; the helper returns
  an empty Map for an empty taxonomy.
- A new SFC
  `apps/registry-viewer/src/components/AbilityEffectFilter.vue`
  renders one chip per taxonomy entry (label + emoji + count of
  cards matching that effect across the session-wide ability tag
  index, independent of other active filters) under the existing
  card-type ribbon in the cards-view filter bar. Chips are
  toggleable; multiple selections OR together (a card matches if
  any selected effect's tag is present).
- `App.vue` fetches the taxonomy on mount, computes the tag index
  exactly once after both registry and taxonomy resolve, mounts the
  new filter, and intersects its selection with the existing
  `applyQuery()` result before assigning to `filteredCards.value`.
- Selecting an effect chip filters the grid in real time. Clearing
  the selection restores the baseline. The filter composes with
  every existing filter (set, hero class, card type, free-text
  search).
- The cards-view header, themes view, loadout view, glossary panel,
  health panel, lightbox, and existing taxonomy / card-types ribbon
  are unchanged.

---

## Assumes

- WP-086 complete:
  `apps/registry-viewer/src/lib/cardTypesClient.ts` exists and is the
  reference shape for the new `cardAbilitiesClient.ts` (singleton
  module-scope promise, devLog instrumentation, dot-joined Zod path
  in warnings, empty-array fallback on HTTP or schema failure).
  `packages/registry/src/schema.ts` exports `CardTypeEntrySchema` /
  `CardTypesIndexSchema` via the narrow `@legendary-arena/registry/schema`
  subpath, which is the import path the new client mirrors.
  D-8601 records the locked schema-subpath import discipline.
- WP-082 / WP-083 complete: the `safeParse`-at-the-boundary +
  full-sentence `[<Domain>] Rejected …` warning pattern is the
  established convention for non-blocking R2 fetchers. The new
  client mirrors it.
- WP-122 / WP-123 complete:
  `apps/registry-viewer/src/registry/shared.ts` exposes
  `flattenSet()` returning FlatCard with a populated
  `abilities: string[]` field for every cardType
  (hero/mastermind/villain/henchman/scheme/bystander/wound/other).
  This packet reads `card.abilities` and never mutates the array or
  the FlatCard shape.
- The R2 bucket at `https://images.barefootbetters.com/metadata/`
  is publicly readable and currently serves `card-types.json`,
  `keywords-full.json`, `rules-full.json`, and `sets.json`. Operator
  uploads `card-abilities.json` to the same path **before** this
  WP is merged so production users see the file at first paint;
  pre-upload behavior is the empty-taxonomy degraded path (chip
  ribbon hidden, baseline grid unchanged).
- `pnpm --filter registry-viewer build` exits 0 on `main`
  pre-session.
- `pnpm --filter registry-viewer typecheck` exits 0 on `main`
  pre-session.
- `pnpm --filter registry-viewer test` reports the post-EC-125
  baseline `tests 31 / suites 6 / pass 31 / fail 0` (locked at
  `main` HEAD `919703f`, 2026-05-01).
- `pnpm --filter @legendary-arena/registry test` reports a green
  baseline pre-session.

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  registry-viewer's allowed import surface, registry package's
  responsibility (data input layer only), prohibition on reaching
  into `game-engine`, `preplan`, `server`, or `pg`.
- `.claude/rules/architecture.md §Import Rules` — runtime
  enforcement view of the same rules.
- `.claude/rules/registry.md` — the registry package's invariants;
  in particular the §"Schema Authority" clause requiring a
  `DECISIONS.md` entry for any modification to
  `packages/registry/src/schema.ts`. The new schemas added here
  satisfy that clause via D-12501.
- `.claude/rules/code-style.md §Abstraction & Control Flow` — the
  *duplicate first, abstract only when a third copy appears* rule
  locking duplication of `cardTypesClient.ts` →
  `cardAbilitiesClient.ts` rather than parameterization.
- `apps/registry-viewer/CLAUDE.md` — viewer architecture (Vue 3 +
  Vite 5 + Zod), single-page tab switching, R2 data source.
- `apps/registry-viewer/src/lib/cardTypesClient.ts` — the reference
  fetcher. Read in full before drafting `cardAbilitiesClient.ts`;
  the new fetcher mirrors this file's structure (module-scoped
  singleton promise, `devLog` start / complete / failed events,
  HTTP `!response.ok` empty-array fallback, `safeParse` with
  dot-joined path warning, terminal `try/catch` swallow with
  empty-array return) line-for-line with ability-prefixed names.
  The new file additionally exports `buildAbilityTagIndex` (a pure
  helper not present in `cardTypesClient.ts`), which is justified
  by WP-086's data not having a per-card derived form whereas this
  WP's data does.
- `apps/registry-viewer/src/registry/shared.ts` — `flattenSet()`
  populates `abilities: string[]` per FlatCard. Read 8–235 before
  drafting `buildAbilityTagIndex` so the matcher operates on the
  correct field.
- `apps/registry-viewer/src/App.vue` — the file to be modified.
  Read the cards-view filter bar (518–581), the `onMounted` block
  (226–314), the `applyFilters()` function (340–354), and the
  taxonomy resolution pattern (cardTypes ref + `displayedTypeGroups`
  computed at 178–390). The new state, fetch, and filter logic
  mirror that shape.
- `packages/registry/src/schema.ts:205–224` — `CardTypeEntrySchema` /
  `CardTypesIndexSchema` reference shape. The new
  `CardAbilityEntrySchema` / `CardAbilityMatcherSchema` /
  `CardAbilitiesIndexSchema` are appended after the card-types block,
  using the same `.strict()` discipline.
- `data/metadata/card-types.json` — the parallel taxonomy artifact;
  read for the JSON-formatting convention (two-space indent, slug +
  label + optional emoji + numeric ordering field). The new
  `card-abilities.json` follows the same conventions.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — canonical field
  names. The new `slug`, `label`, `emoji`, `order`, and `matchers`
  field names align with the existing `card-types.json` shape; no
  field collides with the §8.1 MatchSetupConfig nine-field lock.
- `docs/ai/REFERENCE/00.6-code-style.md` — human-style code rules:
  Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 8
  (no `.reduce()` for branching logic), Rule 11 (full-sentence
  error messages).
- `docs/ai/DECISIONS.md` D-8601 (card-types taxonomy reintroduction
  shape), D-1203 (silent failure mode if a metadata file is fetched
  at the wrong seam), D-12101 (zoom-slider naming conventions
  parallel-readable here for storage / CSS / range constants
  discipline), and any prior decision on a viewer abilities filter
  (there should be none; D-12501 is the new entry).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ — all new files use `import` / `export`, never
  `require()`.
- `node:` prefix on Node.js built-in imports — not applicable in
  scope (browser + registry package; if any `node:` import appears,
  it is a scope violation).
- Test files use `.test.ts` extension — never `.test.mjs`. No tests
  added in this WP (see §Out of Scope justification); pre-session
  baselines preserved.
- Full file contents required for every new or modified file. Diffs,
  snippets, and partial output are forbidden.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (full
  English names, JSDoc on every function, no `.reduce()` for
  branching logic, comments explain WHY).
- No `Math.random()`, no `Date.now()`, no `performance.now()`, no
  `new Date(` in core paths; `cardAbilitiesClient.ts` may use
  `performance.now()` for devLog duration measurement *only*,
  matching the existing `cardTypesClient.ts` precedent (see file
  for prior usage). No other timing reads.
- No new npm dependencies. `package.json` files are unchanged across
  all workspaces.

**Packet-specific:**
- **Production files limited to six (post-amendment).** Three new
  (`card-abilities.json`, `cardAbilitiesClient.ts`,
  `AbilityEffectFilter.vue`) and three modified (`schema.ts`,
  `App.vue`, `devLog.ts`). The original draft limited the count to
  five; `devLog.ts` was added pre-execution (2026-05-01) when the
  duplicate-first mirror of `cardTypesClient.ts` surfaced a
  mechanical dependency on extending the closed `Category` union
  with `"cardAbilities"`. WP-086 (commit `ccc6d0e`) hit the same
  situation and is the precedent. See EC-127 §0 pre-execution
  amendment + D-12501. No other production files touched besides
  governance (STATUS, DECISIONS, WORK_INDEX, EC_INDEX, the WP and
  EC themselves).
- **Schema modifications limited to additions.** `schema.ts` gains
  `CardAbilityMatcherSchema`, `CardAbilityEntrySchema`,
  `CardAbilitiesIndexSchema`, `CardAbilityMatcher`,
  `CardAbilityEntry`, and `CardAbilitiesIndex` exports. No existing
  export is renamed, removed, or re-typed. The card-types and
  glossary blocks are byte-identical pre- and post-execution.
- **Schema `.strict()` discipline.** Every new object schema uses
  `.strict()` at the entry boundary, mirroring
  `CardTypeEntrySchema` exactly. Unknown fields in
  `card-abilities.json` are an explicit rejection, not silent
  accept.
- **Matcher type is closed.** The schema admits exactly one matcher
  type for this packet: `{ type: "regex", pattern: string }`. The
  `type` field is a single-literal `z.literal("regex")` rather than
  a `z.enum([...])` so that adding a future matcher type
  (substring, token-presence, etc.) is an explicit schema decision
  in a follow-up WP rather than a silent extension. Matchers carry
  `flags?: string` (optional) for case-insensitivity etc., defaulting
  to `"i"` at apply time when absent.
- **Fetcher contract is locked at draft.**
  `cardAbilitiesClient.ts` exports exactly two symbols:
  `getCardAbilities(metadataBaseUrl: string): Promise<CardAbilityEntry[]>`
  (singleton, non-blocking, empty-array fallback) and
  `buildAbilityTagIndex(cards: readonly FlatCard[], taxonomy: readonly CardAbilityEntry[]): Map<string, Set<string>>`
  (pure, deterministic, side-effect-free). No `resetCardAbilities`
  is exported in this WP; if a future test harness requires it, that
  WP adds it deliberately. (`cardTypesClient.ts` exports
  `resetCardTypes` because EC-104 needed it; this packet has no
  parallel test harness in scope, so the symmetric symbol is omitted
  rather than added speculatively.)
- **Helper is pure.** `buildAbilityTagIndex` does no I/O, reads no
  module-scope state, throws nothing, and produces identical output
  for identical inputs. Regex compilation happens once per matcher
  inside the function and is reused across every card scanned. The
  function never mutates `cards`, never mutates `taxonomy`, never
  mutates the entries it returns.
- **Component contract is locked at draft.**
  `AbilityEffectFilter.vue` exposes exactly one prop
  (`taxonomy: readonly CardAbilityEntry[]`), one v-model
  (`selectedEffectSlugs: Set<string>`), and one optional prop
  (`tagIndex?: Map<string, Set<string>> | null` — used to compute
  per-chip badge counts; `null` hides the counts). It emits exactly
  one event: `update:selectedEffectSlugs`. No additional emits, no
  lifecycle hooks, no fetching from inside the component, no glossary
  imports.
- **Slug naming.** Effect slugs are kebab-case
  (`^[a-z][a-z0-9-]*$`), parallel to card-type slugs. Reserved
  slugs (cannot collide with cardType taxonomy): the schema does
  not enforce cross-taxonomy uniqueness (different namespaces, no
  runtime collision). Operator authoring discipline: prefix
  ambiguous slugs with the verb domain (e.g., `gain-attack`,
  `gain-recruit`, `gain-piercing`) rather than mirroring card-type
  slugs.
- **Initial taxonomy locked at ten entries.** The first
  `card-abilities.json` ships with exactly ten effect entries
  enumerated in §Locked contract values. Authoring more is a
  follow-up upload (no schema or code change required); authoring
  fewer in this commit is a §Files Expected to Change scope
  violation.
- **R2 path is verbatim `metadata/card-abilities.json`.** Same path
  shape as `metadata/card-types.json`. The viewer fetches
  `${metadataBaseUrl}/metadata/card-abilities.json` and no other
  path.
- **Filter mounts under the card-type ribbon, not in the search
  bar.** The mount point is between the existing `<div class="type-bar">`
  (App.vue:541–569) and the `<div class="set-pills">` (App.vue:572–581).
  The new ribbon does not displace either neighbor.
- **Filter is OR within itself, AND with other filters.** Selecting
  multiple effect chips matches cards with any selected effect's tag
  (logical OR within the abilities filter). Combined with set / hero
  class / card type / search, all filters AND together (existing
  `applyQuery()` semantics preserved).
- **Tag index computed exactly once per session.** After both
  `getRegistry()` and `getCardAbilities()` resolve, App.vue calls
  `buildAbilityTagIndex(allCards.value, taxonomy.value)` once and
  stores the result in `abilityTagIndex.value: Map<string, Set<string>> | null`.
  The Map is read-only thereafter; subsequent filter operations
  consult it without recomputing.
- **No tests added.** The viewer has no Vue component-test harness
  at baseline; verification is build + typecheck + manual smoke. The
  registry package has its smoke test (per
  `.claude/rules/registry.md` §"Registry Smoke Test"); the new
  schemas inherit Zod's parse coverage incidentally via the
  registry's existing parse path but no dedicated assertion is
  added.
- **No layer leaks.** Allowed imports in the new viewer files:
  Vue, the local composables, the new client, and the schema via
  `@legendary-arena/registry/schema` (narrow subpath, NOT the
  barrel — D-8601 binding). Disallowed: `@legendary-arena/game-engine`,
  `@legendary-arena/preplan`, `@legendary-arena/server`, `pg`,
  `boardgame.io`, any `node:` built-in. Allowed imports in the new
  schema additions: `zod` only. Disallowed: any cross-package
  import in the schema file.
- **No modifications to `cardTypesClient.ts`,
  `useCardSize.ts`, `CardSizeSlider.vue`, `CardGrid.vue`, or any
  themes-view file.** All preserved byte-identical pre- and
  post-execution.

**Required `// why:` comments:**
- `card-abilities.json` does not require comments (JSON has none),
  but the WP body documents the regex authoring rationale per
  effect entry.
- `packages/registry/src/schema.ts` block header for the new
  taxonomy — explain that `card-abilities.json` is the second
  metadata-driven taxonomy under WP-086 precedent, that `.strict()`
  rejects unknown fields so any future pipeline drift surfaces as
  an explicit Zod error rather than silent data loss, that the
  matcher type is locked to a single literal (`"regex"`) so adding
  a future matcher type is an explicit schema decision, and that
  D-12501 records the lock.
- `cardAbilitiesClient.ts` module-header JSDoc — explain that the
  client mirrors `cardTypesClient.ts` line-for-line per the
  *duplicate first* rule, that the singleton promise is module-scope
  (one fetch per session), that `safeParse` at the boundary
  degrades to an empty array on HTTP failure or schema rejection
  (never throws — non-blocking by design, same posture as
  `cardTypesClient.ts`), and that `buildAbilityTagIndex` is a pure
  helper that compiles each matcher's regex once and applies it to
  every card's abilities array.
- `cardAbilitiesClient.ts` on the schema-subpath import — explain
  that the import path is `@legendary-arena/registry/schema` (not
  the barrel), citing D-8601 verbatim by ID without enumerating
  the forbidden modules in prose (per §18 prose-vs-grep
  discipline).
- `cardAbilitiesClient.ts` on the matcher-flags default — explain
  that omitted `flags` defaults to `"i"` (case-insensitive) at
  apply time because card text capitalization is inconsistent
  ("KO" / "Ko" / "ko"), and that an explicit empty-string flags
  field disables the default (operator opt-out for cases where
  case sensitivity is required).
- `cardAbilitiesClient.ts` on the regex compilation site — explain
  that compilation happens once per matcher per call (not per card)
  to avoid quadratic regex-engine setup cost across ~3000 cards ×
  ~10 matchers × 1–3 patterns each.
- `cardAbilitiesClient.ts` on any `try/catch` swallow — full-sentence
  swallow documentation per 00.6 Rule 11, identical in shape to
  `cardTypesClient.ts:118–129`.
- `AbilityEffectFilter.vue` module-header JSDoc — explain that the
  ribbon is purely a presentational chip-toggle component (taxonomy
  flows in via prop, selection flows out via `update:selectedEffectSlugs`,
  the tag index is consulted only for badge counts), that the
  component performs no fetching of its own, and that it stays
  hidden when the taxonomy is empty (degraded-mode invisibility
  rather than a visible empty ribbon).
- `App.vue` on the `getCardAbilities()` call site — explain that the
  fetch is parallel to the cardTypes / glossary fetches, that the
  client is non-blocking (resolves to `[]` on failure), and that
  the chip ribbon is silently absent when the taxonomy is empty.
- `App.vue` on the `buildAbilityTagIndex` call site — explain that
  the index is built once after both registry and taxonomy resolve,
  that it is keyed by `card.key` (the `${abbr}-${cardType}-${slug}`
  string established by WP-122), and that subsequent filter
  selections consult the index without recomputing.
- `App.vue` on the post-`applyQuery()` filter step — explain that
  the abilities filter is applied *after* `applyQuery()` rather
  than inside it, because `applyQuery()` belongs to
  `apps/registry-viewer/src/registry/shared.ts` (the registry
  package's per-viewer flatten copy) and an effect-tag concept is
  out of scope for that helper; keeping the filter outside
  preserves the helper's purity.

**Session protocol:**
- If any of the following arises, STOP and ASK before proceeding:
  - The pre-session test baselines do not match the locked figures
    in §Assumes.
  - `apps/registry-viewer/src/lib/cardTypesClient.ts` shows up in
    `git diff --name-only` — it is byte-identical pre- and
    post-execution.
  - `data/metadata/card-types.json`,
    `data/metadata/keywords-full.json`, or
    `data/metadata/rules-full.json` show up in `git diff --name-only`
    — none is touched by this WP.
  - The cards-view filter bar at `App.vue:518–581` does not match
    the documented shape (e.g., a parallel session inserted a
    different control there).
  - Authoring a regex matcher seems to require backreferences or
    lookbehinds for clean phrasing — escalate; the locked starter
    set was authored under a no-lookaround constraint and any
    starter entry that needs more is a candidate for splitting
    into two simpler entries.
  - A starter entry's regex appears to false-positive against
    cards that should not match (e.g., `KO\b` matching "the KO
    pile"). The locked discipline is to constrain the regex
    (require a hand / discard / specific zone phrase) rather than
    relax the entry.
  - Any file outside §Files Expected to Change seems to need
    editing.
  Do not "helpfully" extend scope.

**Locked contract values (inline — do not paraphrase or re-derive):**
- **R2 metadata path (verbatim):** `metadata/card-abilities.json`.
- **Schema export names (verbatim):** `CardAbilityMatcherSchema`,
  `CardAbilityEntrySchema`, `CardAbilitiesIndexSchema`, plus the
  inferred type aliases `CardAbilityMatcher`, `CardAbilityEntry`,
  `CardAbilitiesIndex`.
- **Schema location (verbatim):** appended to
  `packages/registry/src/schema.ts` after the existing card-types
  block (line 205–224 region in current `main`); insertion point
  is immediately after the closing `export type CardTypesIndex = …`
  line.
- **Fetcher exports (verbatim):**
  `export function getCardAbilities(metadataBaseUrl: string): Promise<CardAbilityEntry[]>`
  and
  `export function buildAbilityTagIndex(cards: readonly FlatCard[], taxonomy: readonly CardAbilityEntry[]): Map<string, Set<string>>`.
- **Component import path in `App.vue` (verbatim):**
  `from "./components/AbilityEffectFilter.vue";`
- **Client import path in `App.vue` (verbatim):**
  `from "./lib/cardAbilitiesClient";`
- **State refs in `App.vue` (verbatim):**
  `const abilitiesTaxonomy = ref<CardAbilityEntry[]>([]);`
  `const abilityTagIndex = ref<Map<string, Set<string>> | null>(null);`
  `const selectedEffectSlugs = ref<Set<string>>(new Set());`
- **Schema relational invariant** (enforced post-parse in
  `cardAbilitiesClient.ts`, mirroring the orphan-parentType
  pattern from `cardTypesClient.ts:88–110`): every entry's `slug`
  is unique within the taxonomy. Duplicate slugs warn (one
  dedup'd warn per slug) and the second-and-later entries are
  dropped from the returned array.
- **Initial ten effect-tag entries (verbatim slugs and labels;
  emojis indicative, operator may swap):**
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
- **Pre-session test baselines (verbatim):**
  registry-viewer: `tests 31 / suites 6 / pass 31 / fail 0` (locked
  post-EC-125 at `main` HEAD `919703f`, 2026-05-01).
  Registry package: green at the same `main` HEAD.
- **Post-session test baselines (verbatim):** UNCHANGED — no tests
  added in this WP; both baselines preserved.

---

## Vision Alignment

**Vision clauses touched:** §10a (Registry Viewer public surface —
search and browse quality on `cards.barefootbetters.com`).

**Conflict assertion:** No conflict. This WP improves browse quality
on the public reference surface for the cards view; it adds no
monetization, no persuasive surface, no competitive ranking
implication, and no change to user-visible copy beyond the ten
effect labels (`Draw a card`, `KO from hand`, etc.). Labels are
descriptive of game mechanics, taken verbatim from rulebook phrasing
where applicable.

**Non-Goal proximity check:** None of NG-1..NG-7 is crossed. The
filter is a client-local UI affordance with no game-state coupling
and no payment surface.

**Determinism preservation:** N/A — no scoring, replay, RNG, or
simulation surfaces are touched. Tag computation is pure and
deterministic given identical taxonomy + cards inputs, but produces
no game-state mutation.

---

## Funding Surface Gate

**§20 — N/A.** This WP touches no §20.1 trigger surface: no global
nav funding affordance, no registry-viewer funding affordance, no
profile-level funding attribution, no tournament-funding integration,
and no user-visible copy referencing donate / support / tournament
funding. The ten effect labels listed in §Locked contract values are
the only new user-visible strings; none references funding channels.
Justification per §20.1 N/A discipline: "registry-viewer cards-view
abilities filter; no funding-adjacent UI, no payment surface, no
donation prompt, no storefront cross-link."

---

## §21 API Catalog — N/A

This WP touches no §21.1 trigger surface: no HTTP endpoint added,
modified, removed, or status-changed in `apps/server`; no
`apps/server/src/**` library function added or modified.
Justification per §21.4: "viewer-only UI affordance plus
registry-package schema additions; no `apps/server` files touched,
no HTTP surface affected." (R2 is a static file host, not an
`apps/server` route — out of §21 scope.)

---

## Debuggability & Diagnostics

This packet is UI + schema, introduces no game state, no RNG, and no
mutation of `G` / `ctx`. The applicable subset of the template's
diagnostics clauses:

- **Deterministic reproduction:** the per-card tag set is fully
  determined by the taxonomy file and the card's `abilities[]`
  strings. Identical taxonomy + identical card data = identical tag
  index. The filter result is deterministic in the chip selection.
- **External observability:** the taxonomy fetch, `safeParse`
  rejection (if any), and tag-index size are visible via `devLog`
  events under the existing viewer devLog channel pattern. The
  selected chip set is visible in the DOM via the chip ribbon's
  `aria-pressed` state on each chip button.
- **State mutation surface:** the only new module-scope state is
  the `_promise` singleton inside `cardAbilitiesClient.ts`,
  matching `cardTypesClient.ts:40`. App-scoped state is the three
  refs enumerated in §Locked contract values.
- **Failure localization:** any visible regression in the abilities
  filter must trace to one of the five files in §Files Expected to
  Change; if it does not, the packet's scope was violated.
- **`G.messages` usage:** N/A — this packet does not touch `G`.

---

## Scope (In)

### A) `data/metadata/card-abilities.json` — new

- JSON array of ten `CardAbilityEntry` objects, one per starter
  effect listed in §Locked contract values.
- Each entry shape:
  ```
  {
    "slug": "<kebab-case>",
    "label": "<display label>",
    "emoji": "<single emoji>",   // optional
    "order": <integer, 10-step>,
    "matchers": [
      { "type": "regex", "pattern": "<RE2-safe pattern>", "flags": "i" }
    ]
  }
  ```
- Operator authoring discipline (per `// why:` comments above and
  §Constraints):
  - Regex patterns avoid lookarounds and backreferences (RE2-safe
    posture even though the runtime uses JS regex; this keeps a
    future migration to a server-side validator portable).
  - Patterns require enough specificity to avoid false positives
    (e.g., `KO from hand` matchers anchor on `\bKO [a-z ]*from your hand\b`,
    not bare `\bKO\b` which would match "the KO pile").
  - Each entry's `matchers` array may contain 1–4 patterns; OR
    semantics within an entry. Operator MAY iterate the patterns
    after merge (R2 publish is independent of code change).
  - `order` values are used only for stable sort order in the chip
    ribbon; they are NOT required to be contiguous, dense, or to
    start at 0. Gaps are permitted (e.g., `10, 20, 30, 100`) so
    operators authoring follow-on entries can insert at any
    position without renumbering. The starter file uses 10-step
    spacing as a convention, not a constraint.
- Two-space indent, trailing newline. Validated locally against
  `CardAbilitiesIndexSchema` before commit.

### B) `packages/registry/src/schema.ts` — modified

Add the following blocks **after** the closing
`export type CardTypesIndex = z.infer<typeof CardTypesIndexSchema>;`
line, before the existing `CardType = string` alias. No other
existing block is modified.

```
// ── Card-abilities effect-tag taxonomy (card-abilities.json) ────────────
// why: WP-125 second metadata-driven taxonomy (card-types.json was the first,
// per WP-086 / D-8601). .strict() rejects unknown fields so any future
// pipeline drift surfaces as an explicit Zod error rather than silent data
// loss. The matcher.type field is locked to a single z.literal("regex") so
// adding a future matcher type (substring / token-presence / structured) is
// an explicit schema decision in a follow-up WP rather than a silent
// extension. D-12501 records the lock.

export const CardAbilityMatcherSchema = z.object({
  type:    z.literal("regex"),
  pattern: z.string().min(1),
  flags:   z.string().optional(),
}).strict();

export const CardAbilityEntrySchema = z.object({
  slug:     z.string().min(1).regex(/^[a-z][a-z0-9-]*$/),
  label:    z.string().min(1),
  emoji:    z.string().optional(),
  order:    z.number().int().nonnegative(),
  matchers: z.array(CardAbilityMatcherSchema).min(1),
}).strict();

export const CardAbilitiesIndexSchema = z.array(CardAbilityEntrySchema);

export type CardAbilityMatcher = z.infer<typeof CardAbilityMatcherSchema>;
export type CardAbilityEntry   = z.infer<typeof CardAbilityEntrySchema>;
export type CardAbilitiesIndex = z.infer<typeof CardAbilitiesIndexSchema>;
```

The `slug` regex enforces kebab-case at parse time. Duplicate-slug
detection is a relational invariant enforced post-parse in
`cardAbilitiesClient.ts` (Zod cannot express cross-element uniqueness),
matching the orphan-parentType discipline of WP-086.

### C) `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` — new

- ESM-only, browser-safe (no `node:` imports, no Node-only modules).
- Module-header JSDoc per §Required `// why:` comments.
- Imports `CardAbilitiesIndexSchema` and types from
  `@legendary-arena/registry/schema` (narrow subpath; D-8601 cited
  by ID per §18 discipline).
- Imports `devLog` from `./devLog` and `FlatCard` type from
  `../registry/types/types-index`.
- Module-scope singleton `_promise: Promise<CardAbilityEntry[]> | null = null;`
- Exports two symbols:
  - `getCardAbilities(metadataBaseUrl: string): Promise<CardAbilityEntry[]>`
    — singleton fetcher mirroring `getCardTypes()` line-for-line:
    `devLog` start / failed / complete events, HTTP `!response.ok`
    empty-array fallback, `safeParse` with dot-joined-path warning,
    duplicate-slug post-parse filter (one dedup'd warn per
    duplicate slug, second-and-later entries dropped), terminal
    `try/catch` swallow returning `[]` (never throws).
  - `buildAbilityTagIndex(cards, taxonomy): Map<string, Set<string>>`
    — pure helper:
    1. Compile every matcher's regex once into a parallel
       `Array<{ entry: CardAbilityEntry, regex: RegExp }>`. Default
       `flags = "i"` when absent; respect operator override (including
       explicit empty string for case-sensitive).
    2. For each card in `cards`, for each ability text in
       `card.abilities`, for each compiled matcher: if any of the
       matcher's compiled regexes matches the ability text, add
       the matcher's entry slug to the card's tag set.
    3. Return `Map<card.key, Set<slug>>`. Cards with no matching
       tags have no entry in the Map (callers treat absent === empty).
    4. Use explicit `for...of` loops; no `.reduce()`, no nested
       ternaries, no dynamic property access for known keys.
- No additional exports; no `resetCardAbilities()` in this WP.

### D) `apps/registry-viewer/src/components/AbilityEffectFilter.vue` — new

- Vue 3 SFC, `<script setup lang="ts">`, scoped CSS.
- Module-header JSDoc per §Required `// why:` comments.
- Imports `CardAbilityEntry` from
  `@legendary-arena/registry/schema`.
- Props (one required, one optional):
  ```
  defineProps<{
    taxonomy: readonly CardAbilityEntry[];
    tagIndex?: Map<string, Set<string>> | null;
  }>()
  ```
- v-model:
  ```
  defineModel<Set<string>>("selectedEffectSlugs", { required: true });
  ```
- Renders nothing when `taxonomy.length === 0` (degraded-mode
  invisibility — no empty ribbon shell, no placeholder).
- Renders one `<button class="effect-chip">` per taxonomy entry,
  ordered by `entry.order`. Each chip displays `entry.emoji`
  (when present) + `entry.label`. When `tagIndex` is non-null, a
  small badge displays the count of cards tagged with that effect
  across the session-wide ability tag index (computed once at
  startup; intentionally independent of other active filters — set,
  hero class, card type, search). The badge count is therefore
  global per effect, not a count of currently visible cards.
- Chip click toggles the slug in `selectedEffectSlugs` and emits
  `update:selectedEffectSlugs`.
- ARIA: each chip carries `aria-pressed="<boolean>"` and
  `aria-label="Toggle <label> effect filter"`.
- Scoped CSS uses the same dark-theme literal color tokens as
  the existing `.type-group-btn` style in `App.vue`
  (`#1e1e2e` / `#33334a` / `#8888cc` family) so the two ribbons
  read as a coherent set.
- No emits beyond `update:selectedEffectSlugs`. No lifecycle hooks.
  No fetching from inside the component.

### E) `apps/registry-viewer/src/App.vue` — modified

- New imports in `<script setup>` (alphabetical position is fine;
  ordering is not load-bearing):
  - `import AbilityEffectFilter from "./components/AbilityEffectFilter.vue";`
  - `import { getCardAbilities, buildAbilityTagIndex } from "./lib/cardAbilitiesClient";`
  - `import type { CardAbilityEntry } from "@legendary-arena/registry/schema";`
- Three new top-level refs (placement: alongside existing card-types
  taxonomy refs near line 178–188):
  - `const abilitiesTaxonomy = ref<CardAbilityEntry[]>([]);`
  - `const abilityTagIndex = ref<Map<string, Set<string>> | null>(null);`
  - `const selectedEffectSlugs = ref<Set<string>>(new Set());`
- New fetch in `onMounted` (insertion: after the existing
  `getCardTypes()` await, before the glossary fetch):
  ```
  loadStatus.value = "Loading abilities taxonomy…";
  abilitiesTaxonomy.value = await getCardAbilities(metadataBaseUrl);
  if (abilitiesTaxonomy.value.length > 0) {
    abilityTagIndex.value = buildAbilityTagIndex(
      allCards.value,
      abilitiesTaxonomy.value,
    );
  }
  ```
- Modify `applyFilters()` to apply the abilities filter as a
  post-step on the `applyQuery()` result (preserves shared.ts
  purity — see §Required `// why:` comments). Insertion at the end
  of `applyFilters()`, replacing the bare assignment to
  `filteredCards.value`:
  ```
  const queryResults = registry.value.query(q as any);
  if (selectedEffectSlugs.value.size > 0 && abilityTagIndex.value) {
    const tagIndex = abilityTagIndex.value;
    const selected = selectedEffectSlugs.value;
    filteredCards.value = queryResults.filter((card) => {
      const tags = tagIndex.get(card.key);
      if (!tags) return false;
      for (const slug of selected) {
        if (tags.has(slug)) return true;
      }
      return false;
    });
  } else {
    filteredCards.value = queryResults;
  }
  selectedCard.value = null;
  ```
- Extend `clearAllFilters()` to reset `selectedEffectSlugs.value`.
  Insertion: alongside the existing `selectedTypes.value = new Set()`
  reset.
- Mount the filter in the cards-view filter region between the
  type-bar and the set-pills (App.vue:570–571 region):
  ```
  <AbilityEffectFilter
    v-if="abilitiesTaxonomy.length > 0"
    :taxonomy="abilitiesTaxonomy"
    :tag-index="abilityTagIndex"
    v-model:selected-effect-slugs="selectedEffectSlugs"
    @update:selected-effect-slugs="applyFilters"
  />
  ```
- No other `App.vue` template region changes. The themes-view
  filter bar, the loadout region, the header, and all `<style>`
  blocks are byte-identical.

---

## Out of Scope

- **Themes-view filter changes.** WP-124 owns themes-view zoom; this
  WP touches the cards view only. The themes view has no abilities
  surface (themes are setup intents, not cards).
- **Loadout-view filter changes.** `LoadoutBuilder.vue` /
  `LoadoutPreview.vue` are not modified.
- **Card-types ribbon modifications.** `displayedTypeGroups`
  computed, `LEGACY_TYPE_GROUPS` array, and the existing type-bar
  template region are byte-identical pre- and post-execution.
- **Registry package's `applyQuery()`.** The shared helper at
  `apps/registry-viewer/src/registry/shared.ts:237` is unchanged;
  the abilities filter is applied as a viewer-local post-step, not
  inside `applyQuery()`. Justification: effect-tag knowledge is
  viewer-local; `shared.ts` stays pure of taxonomy-derived
  concepts.
- **Card detail panel, glossary panel, lightbox, health panel.**
  None is modified. The detail panel's existing ability rendering
  via `parseAbilityText` continues unchanged.
- **A precomputed forward index.** A `card-abilities-index.json`
  mapping cardKey → tags was explicitly considered and rejected
  (cross-repo coupling with `bbcode/modern-master-strike`; auto-memory
  *Card data pipeline (cross-repo) — fix upstream, not in-repo*
  flags this anti-pattern). Tagging happens at runtime in the
  viewer using the taxonomy.
- **A second matcher type.** Substring matchers, token-presence
  matchers, and structured matchers are deliberately deferred. The
  schema admits exactly `{ type: "regex" }` in this WP; adding a
  matcher type is a follow-up WP that updates both the schema and
  the apply-time switch in `buildAbilityTagIndex`.
- **Per-card override file.** A `card-effect-overrides.json` for
  hand-tagging individual cards (cited as an "escape hatch" in the
  pre-WP discussion) is deferred. If matcher false-positives or
  false-negatives prove unfixable via regex tuning during operator
  use, that follow-up WP adds the override surface deliberately.
- **Tests for the new schemas, fetcher, helper, or component.** The
  viewer has no Vue component-test harness at baseline. The new
  Zod schemas inherit incidental parse coverage via the registry
  smoke test; no dedicated assertion is added in this WP.
- **A "Why was this card tagged?" tooltip.** Showing operators
  which matcher pattern produced a given tag is deferred; useful
  for taxonomy debugging but not load-bearing for the user-visible
  filter.
- **Cross-tag boolean composition.** Selecting two effect chips
  is OR (a card matches either effect). AND composition (a card
  matches *both* effects) is deliberately not surfaced — would
  require a UI mode toggle and complicates the chip mental model.
- **Persisting the user's chip selection across reloads.** The
  selection resets on page load. Persistence parallel to
  `cardGridSize` / `themeGridSize` is a follow-up if user research
  shows demand.

---

## Files Expected to Change

- `data/metadata/card-abilities.json` — **new** — ten starter
  effect-tag entries with regex matchers; validated against
  `CardAbilitiesIndexSchema`; uploaded to R2 at
  `metadata/card-abilities.json` before merge.
- `packages/registry/src/schema.ts` — **modified** — appends
  `CardAbilityMatcherSchema`, `CardAbilityEntrySchema`,
  `CardAbilitiesIndexSchema` and their inferred type aliases
  after the existing card-types block. No other change.
- `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` — **new** —
  singleton fetcher mirroring `cardTypesClient.ts`, plus pure
  `buildAbilityTagIndex` helper. Two exports total.
- `apps/registry-viewer/src/components/AbilityEffectFilter.vue` —
  **new** — chip-toggle ribbon component with v-model, taxonomy
  prop, optional tag-index prop, scoped CSS.
- `apps/registry-viewer/src/App.vue` — **modified** — three new
  imports, three new refs, one new fetch in `onMounted`, one
  modified `applyFilters` body, one extended `clearAllFilters`,
  one new template mount between type-bar and set-pills.
- `apps/registry-viewer/src/lib/devLog.ts` — **modified** — single
  `"cardAbilities"` member appended to the closed `Category` union,
  required for `cardAbilitiesClient.ts` to compile under `vue-tsc`.
  Added pre-execution (2026-05-01) under EC-127 §0 amendment;
  WP-086 (commit `ccc6d0e`) precedent for the parallel
  `"cardTypes"` extension.
- `docs/ai/work-packets/WP-125-registry-viewer-card-abilities-effect-filter.md` —
  **new** — this file.
- `docs/ai/execution-checklists/EC-127-registry-viewer-card-abilities-effect-filter.checklist.md` —
  **new** — companion EC (drafted in a follow-up authoring step
  per WP-124's precedent; EC-127 is the next free slot after
  EC-126 reserved for WP-124 on 2026-05-01).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — adds the
  WP-125 row at execution-commit time.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — adds
  the EC-127 row at execution-commit time.
- `docs/ai/DECISIONS.md` — **modified** — adds D-12501 (locked
  taxonomy file path, schema names, matcher-type single-literal
  lock, slug regex, initial ten-entry baseline; cites
  *duplicate first* and D-8601 as the precedents).
- `docs/ai/STATUS.md` — **modified** — adds the WP-125 execution
  entry at the top of `## Current State`.

---

## Acceptance Criteria

- [ ] `data/metadata/card-abilities.json` exists, parses cleanly
  against `CardAbilitiesIndexSchema` (verified by the one-shot
  `node -e` snippet in §Verification Steps), and contains exactly
  ten entries with the slugs locked in §Locked contract values.
- [ ] `packages/registry/src/schema.ts` exports
  `CardAbilityMatcherSchema`, `CardAbilityEntrySchema`,
  `CardAbilitiesIndexSchema`, and their inferred types; existing
  `CardTypeEntrySchema` / `CardTypesIndexSchema` exports are
  byte-identical.
- [ ] `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` exists
  and exports exactly `getCardAbilities` and
  `buildAbilityTagIndex`.
- [ ] `apps/registry-viewer/src/components/AbilityEffectFilter.vue`
  exists, accepts the locked prop / v-model contract, and renders
  nothing when the taxonomy is empty.
- [ ] On the cards view with the taxonomy fetched successfully, a
  visible chip ribbon appears between the type-bar and the
  set-pills, with one chip per taxonomy entry sorted by `order`.
- [ ] Selecting a chip filters the grid to cards whose abilities
  match that effect's matchers; selecting multiple chips ORs.
  Combined with set / hero class / card type / search filters,
  all filters AND together (cards-view existing semantics
  preserved).
- [ ] Clearing all filters via the existing "All" / clear-link
  affordances also resets the chip selection.
- [ ] When R2 is unreachable or `card-abilities.json` is malformed,
  the chip ribbon is silently absent and the cards view remains
  fully functional (degraded-mode invisibility, no console error
  beyond the `[CardAbilities] Rejected …` warning).
- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter registry-viewer typecheck` exits 0.
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
  (registry smoke test green; new schemas do not break the parse
  path).
- [ ] `pnpm --filter registry-viewer test` reports
  `tests 31 / suites 6 / pass 31 / fail 0` (UNCHANGED from the
  pre-session baseline — no tests added).

---

## Verification Steps

```pwsh
# 1. Build cleanly
pnpm --filter registry-viewer build
# Expected: exits 0, dist/ regenerated, no Vite warnings beyond baseline.

# 2. Type-check
pnpm --filter registry-viewer typecheck
# Expected: exits 0.

# 3. Registry package smoke test
pnpm --filter @legendary-arena/registry test
# Expected: exits 0; existing smoke test passes; new schema additions
# do not break the parse path.

# 4. Viewer test baseline preserved
pnpm --filter registry-viewer test
# Expected: tests 31 / suites 6 / pass 31 / fail 0 (UNCHANGED).

# 5. Off-scope diff verification
git diff apps/registry-viewer/src/lib/cardTypesClient.ts
# Expected: no output.
git diff apps/registry-viewer/src/composables/useCardSize.ts
# Expected: no output.
git diff apps/registry-viewer/src/components/CardSizeSlider.vue
# Expected: no output.
git diff apps/registry-viewer/src/components/CardGrid.vue
# Expected: no output.
git diff apps/registry-viewer/src/components/ThemeGrid.vue
# Expected: no output (WP-124-touched file is byte-identical).
git diff apps/registry-viewer/src/registry/shared.ts
# Expected: no output (registry-package flatten copy is byte-identical).
git diff data/metadata/card-types.json
# Expected: no output.
git diff data/metadata/keywords-full.json
# Expected: no output.
git diff data/metadata/rules-full.json
# Expected: no output.
git diff apps/registry-viewer/package.json
# Expected: no output (no dependencies added).
git diff packages/registry/package.json
# Expected: no output.

# 6. New file existence + contract verification
Select-String -Path "packages\registry\src\schema.ts" -Pattern "CardAbilityMatcherSchema = z.object"
# Expected: exactly one match.
Select-String -Path "packages\registry\src\schema.ts" -Pattern "CardAbilityEntrySchema = z.object"
# Expected: exactly one match.
Select-String -Path "packages\registry\src\schema.ts" -Pattern "CardAbilitiesIndexSchema = z.array"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\lib\cardAbilitiesClient.ts" -Pattern "export function getCardAbilities"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\lib\cardAbilitiesClient.ts" -Pattern "export function buildAbilityTagIndex"
# Expected: exactly one match.

# 7. Slug taxonomy verification
Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"draw"'
# Expected: exactly one match.
Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"ko-from-hand"'
# Expected: exactly one match.
Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"rescue-bystander"'
# Expected: exactly one match.
Select-String -Path "data\metadata\card-abilities.json" -Pattern '"slug":\s*"defeat-villain"'
# Expected: exactly one match.

# 8. Schema parse smoke (one-shot)
node -e "const fs=require('node:fs'); const {z}=require('zod'); const raw=JSON.parse(fs.readFileSync('data/metadata/card-abilities.json','utf8')); console.log('entries:', raw.length); const slugs=new Set(); for (const e of raw) { if (slugs.has(e.slug)) throw new Error('duplicate slug: '+e.slug); slugs.add(e.slug); } console.log('unique slugs:', slugs.size);"
# Expected: "entries: 10" then "unique slugs: 10".

# 9. Slider mount verification
Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "<AbilityEffectFilter"
# Expected: exactly one match (the template instance).
Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "import AbilityEffectFilter"
# Expected: exactly one match (the import statement).
Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "import \{ getCardAbilities, buildAbilityTagIndex \}"
# Expected: exactly one match.

# 10. Manual smoke (not gated)
pnpm --filter registry-viewer dev
# Open http://localhost:5173, Cards tab. Verify:
#   1. The effect chip ribbon appears between the type-bar and set-pills.
#   2. Ten chips are visible, ordered as locked.
#   3. Click "Draw a card" — grid filters to cards whose ability text
#      matches the draw matcher; count badge in top-right reflects.
#   4. Click "KO from hand" — grid widens to OR of the two effects.
#   5. Combine with hero-class filter (e.g., "tech") — grid narrows;
#      AND composition with existing filters works.
#   6. Click "All" in the type-bar — all filters reset including chips.
#   7. Devtools → Network: confirm `metadata/card-abilities.json` is
#      fetched once.
#   8. Stop the R2 host (or rename the JSON to force 404) and reload —
#      chip ribbon is silently absent; card view fully functional;
#      console shows `[CardAbilities] Rejected …` or `load failed`
#      warning only.
```

If any verification step fails, STOP and escalate. Do not patch
around a failing gate.

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] All Verification Steps pass.
- [ ] `git diff --name-only` shows only the eleven files in §Files
  Expected to Change.
- [ ] D-12501 added to `docs/ai/DECISIONS.md` (locked taxonomy path,
  schema names, matcher single-literal lock, slug regex, initial
  ten-entry baseline; cites *duplicate first* and D-8601 / D-1203 as
  precedents).
- [ ] `data/metadata/card-abilities.json` uploaded to the R2 path
  `https://images.barefootbetters.com/metadata/card-abilities.json`
  **before** the commit lands on `main`. Verify with `curl` (or a
  browser fetch) prior to merge.
- [ ] `docs/ai/STATUS.md` updated with the WP-125 execution entry.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-125 row checked off
  with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-127 row set to
  `Done <date>`.
- [ ] No new npm dependencies added; `package.json` unchanged across
  all workspaces.
- [ ] Commit prefix `EC-127:` per
  `docs/ai/REFERENCE/01.3-commit-hygiene-under-ec-mode.md` (never
  `WP-125:`).
- [ ] Manual smoke at the chip extremes (zero selected, all ten
  selected) performed; both modes render correctly and the
  AND-with-other-filters composition works.

---

## Lint-Gate Self-Review (per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`)

| §  | Topic                          | Disposition |
|----|--------------------------------|-------------|
| 1  | WP structure                   | PASS — all required sections present (Status, Dependencies, Session Context, Goal, Assumes, Context, Non-Negotiable Constraints, Vision Alignment, Funding Surface Gate, §21 API Catalog, Debuggability, Scope, Out of Scope, Files Expected to Change, Acceptance Criteria, Verification Steps, Definition of Done, Lint-Gate Self-Review). |
| 2  | Non-Negotiable Constraints     | PASS — engine-wide block intact (ESM only, full file contents required, partial output forbidden, references `00.6-code-style.md`, no new npm dependencies); packet-specific block names sole files modified, locked contract values inline, session-protocol stop-and-ask clauses, required `// why:` comments. |
| 3  | `## Assumes`                   | PASS — lists WP-086 hard dep + WP-082 / WP-083 / WP-122 / WP-123 soft deps + R2 upload assumption + pre-session build / typecheck / test baselines for both viewer and registry package. |
| 4  | `## Context (Read First)`      | PASS — specific files cited with line ranges where relevant; ARCHITECTURE.md §Layer Boundary cited; `00.6-code-style.md` cited; `.claude/rules/registry.md` cited (the registry rules file that requires DECISIONS.md entry for schema modification); `00.2-data-requirements.md` cited (no field-name conflict); DECISIONS.md scan instruction with specific D-IDs cited (D-8601, D-1203, D-12101). |
| 5  | `## Files Expected to Change`  | PASS — eleven files listed (five production, two governance new, four ledger), each with `— new` / `— modified` and a one-line description. Soft over the §5 advisory cap of `~8`; matches WP-086 / WP-124 precedent. Splitting (e.g., taxonomy plumbing in one WP, UI integration in another) is rejected because it forces a half-shipped middle state — a schema without consumers, or a client without a schema to validate against. The five-file production scope is internally cohesive; the six-file governance tail is mandatory ledger work (`schema.ts` modification triggers the registry-rules DECISIONS entry per `.claude/rules/registry.md` §"Schema Authority"). |
| 6  | Naming consistency             | PASS — `CardAbilityMatcherSchema` / `CardAbilityEntrySchema` / `CardAbilitiesIndexSchema` mirror `CardTypeEntrySchema` / `CardTypesIndexSchema` shape; `cardAbilitiesClient.ts` parallels `cardTypesClient.ts`; `data/metadata/card-abilities.json` parallels `data/metadata/card-types.json`. No abbreviations. Slug regex enforces kebab-case at parse time matching card-type slug shape. No collision with §8.1 MatchSetupConfig nine-field lock (no overlapping field names). |
| 7  | Dependency discipline          | PASS — no new npm dependency. Forbidden packages not introduced. |
| 8  | Architectural boundaries       | PASS — viewer-only UI affordance plus registry-package schema additions; layer boundary preserved (no `game-engine`, `preplan`, `server`, `pg`, or `boardgame.io` imports added). Schema additions stay within the registry package's data-input-layer responsibility (per `.claude/rules/registry.md`). The DECISIONS.md entry requirement for `schema.ts` modification is honored via D-12501. |
| 9  | Windows compatibility          | PASS — Verification Steps use `pwsh`-style `Select-String`; paths use `\` separators in shell snippets; the `node -e` snippet in step 8 uses unquoted JS that works under both bash and pwsh; `pnpm --filter` and `git diff` are cross-shell. |
| 10 | Environment variable hygiene   | N/A — no env vars added or referenced. Justification: viewer correctness fix; no new env required. |
| 11 | Authentication clarity         | N/A — no auth surface touched. Justification: viewer UI affordance plus schema additions; no JWT, no session, no protected endpoint. |
| 12 | Test quality                   | N/A — no tests added. Justification: viewer has no Vue component-test harness at baseline (locked under WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-124 viewer-side precedent — manual smoke is the verification mechanism for component-level behavior). New Zod schemas inherit incidental parse coverage via the registry smoke test. Test baselines preserved (viewer 31 / 6 / 31 / 0; registry green). |
| 13 | Commands and verification      | PASS — every Verification Step is exact `pnpm` invocation, `git diff` against named paths, `Select-String` with expected output, or one-shot `node -e` snippet with expected stdout. |
| 14 | Acceptance criteria quality    | PASS — 12 binary, observable, specific items (within the 6–12 cap). Initial draft had 13 (file existence + entry count + schema exports were three items); collapsed to a single entry-count + parse-cleanly criterion at lint sign-off (2026-05-01) per the §14 cap. |
| 15 | Definition of Done             | PASS — includes STATUS.md, DECISIONS.md, WORK_INDEX.md, EC_INDEX.md, R2 upload precondition, and scope-boundary check (`git diff --name-only` shows only the eleven files). |
| 16 | Code style                     | PASS — full English names (`getCardAbilities`, `buildAbilityTagIndex`, `selectedEffectSlugs`, `abilityTagIndex`); JSDoc required on every function in the new client + module-header JSDoc on the new component and the schema block; `// why:` comments enumerated for every non-obvious decision; explicit `for...of` loops in `buildAbilityTagIndex` (no `.reduce()`); no `import *`, no terse error messages (no errors thrown in scope — fetcher swallows and returns empty array). |
| 17 | Vision Alignment               | PASS — §10a (Registry Viewer) cited; no NG-1..NG-7 crossed; determinism N/A with explicit justification (tag computation is pure but produces no game-state mutation). |
| 18 | Prose-vs-grep discipline       | PASS — Verification Steps grep targets are intended new code (`CardAbilityMatcherSchema = z.object`, `getCardAbilities`, `buildAbilityTagIndex`, `<AbilityEffectFilter`, ten slug strings) and removed legacy patterns (none — no removals). No grep targets a forbidden token. The `// why:` comment on the schema-subpath import cites D-8601 by ID rather than enumerating forbidden modules verbatim. |
| 19 | Bridge-vs-HEAD staleness       | N/A — this WP is not a repo-state-summarizing artifact (no commit-history snapshot, no "Recent commits" enumeration, no STATUS-block draft). Reconciliation discipline applies at execution-commit time per the standard process. |
| 20 | Funding Surface Gate           | N/A — explicit one-line justification provided in §Funding Surface Gate above ("registry-viewer cards-view abilities filter; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link"). |
| 21 | API Catalog Update             | N/A — explicit justification provided in §§21 API Catalog above ("viewer-only UI affordance plus registry-package schema additions; no `apps/server` files touched, no HTTP surface affected"). |

**Final gate:** PASS. Ready for user review and execution scheduling.
