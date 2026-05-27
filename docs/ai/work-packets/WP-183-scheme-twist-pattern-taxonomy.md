# WP-183 — Scheme Twist Pattern Taxonomy for Registry Viewer

## Goal

Add a "Scheme Twist Pattern" taxonomy to `cards.legendary-arena.com` so
users browsing schemes can see and filter by the mechanical pattern each
scheme's twist follows (e.g., "reveal or punish," "chained reveals,"
"wound distribution"). Surface the taxonomy as filter chips, card-detail
badges, and grid-tile badges. This is a **registry-viewer-only** change —
no engine, no game logic.

---

## Assumes

- WP-182 ✅ — Scheme Twist Resolver Framework (engine-side) landed
  2026-05-27. WP-183 is the viewer-side counterpart; it does NOT depend
  on WP-182 at runtime (viewer never imports game-engine), but the 8
  twist-pattern slugs are informed by WP-182's resolver taxonomy.
- WP-083 ✅ — Fetch-Time Schema Validation for Registry-Viewer Clients
  landed. The singleton-factory + Zod `.safeParse()` + `Promise.allSettled`
  pattern is established (`cardAbilitiesClient.ts`, `glossaryClient.ts`).
- WP-170 ✅ — Card Count Display landed. `flattenSet()` signature already
  accepts optional enrichment parameters (precedent for `schemeTwistAssignments`).
- `packages/registry/src/schema.ts` is the canonical Zod schema location
  for registry data. New schemas may be added as siblings if the file is
  large.
- `apps/registry-viewer/src/registry/shared.ts` contains `flattenSet()`
  and `applyQuery()` — the two functions this WP modifies.
- R2 metadata bucket at `https://images.barefootbetters.com/metadata/`
  already hosts `card-abilities.json` and `glossary.json`. New files
  follow the same pattern.
- Live card data at `data/cards/*.json` (40 sets) contains scheme cards
  with `abilities[]` entries starting with `"Twist:"`. All 191 schemes
  are reachable.
- **Drafting baseline:** `origin/main @ e517301` (2026-05-27).

---

## Context

191 schemes across 40 card sets collapse into ~8 mechanical twist patterns,
but the registry viewer displays them as an undifferentiated wall. Users
(and game designers evaluating which schemes to implement next) can't
quickly find "all schemes that KO heroes from the HQ" or "all schemes
where effects escalate with twist count." The twist-text classification is
manual (191 entries, operator-reviewed) and stored as static metadata —
no NLP, no runtime inference.

This WP follows the same data + client + filter pattern established by
WP-060 (glossary), WP-082 (keyword labels), and WP-083 (schema
validation): static JSON on R2, singleton-cached client, Zod validation at
the fetch boundary, filter chips in the Cards view.

---

## Scope (In) / (Out)

### In

- **Data files** — two new JSON files under `data/metadata/`:
  - `scheme-twist-patterns.json` — the 8 pattern definitions (slug,
    label, emoji, order, description)
  - `scheme-twist-assignments.json` — 191 scheme ext_id → pattern slug
    mappings (populated by reading actual twist text from card data)
- **Registry Zod schemas** — `SchemeTwistPatternSchema`,
  `SchemeTwistPatternsIndexSchema`, `SchemeTwistAssignmentsSchema` +
  inferred type exports
- **Registry-viewer client** — `schemeTwistClient.ts` singleton-factory
  (fetch, validate, cache)
- **FlatCard extension** — optional `twistPattern?: string` field
- **flattenSet modification** — new `schemeTwistAssignments?` parameter;
  lookup + enrichment for scheme cards
- **applyQuery modification** — new `twistPatterns?: Set<string>` filter;
  AND-combined with existing filters
- **Filter UI** — new `SchemeTwistFilter.vue` chip ribbon component
- **CardDetail badge** — twist-pattern badge with emoji + label + tooltip
- **CardGrid badge** — subtle twist-pattern overlay on scheme tiles
- **App.vue wiring** — parallel fetch, reactive refs, wire to flattenSet
  and filter

### Out

- Master Strike patterns (future — same approach, different taxonomy)
- Villain fight-effect patterns (future)
- Engine resolver implementation (that's WP-182)
- Automated twist-text parsing / NLP classification (manual assignment
  is fine for 191 entries)
- Scheme setup instruction display (already handled by existing abilities
  text)
- Modifying any game-engine files
- Any `DECISIONS.md` entries (no engine architecture impact)

---

## Files Expected to Change

1. `data/metadata/scheme-twist-patterns.json` — **new** — 8 pattern entries
2. `data/metadata/scheme-twist-assignments.json` — **new** — 191 scheme →
   pattern mappings
3. `packages/registry/src/schema.ts` — **modify** — add 3 Zod schemas +
   type exports
4. `apps/registry-viewer/src/lib/schemeTwistClient.ts` — **new** —
   singleton-cached R2 fetcher
5. `apps/registry-viewer/src/components/SchemeTwistFilter.vue` — **new** —
   filter chip ribbon
6. `apps/registry-viewer/src/components/CardDetail.vue` — **modify** —
   twist-pattern badge
7. `apps/registry-viewer/src/components/CardGrid.vue` — **modify** —
   twist-pattern tile badge
8. `apps/registry-viewer/src/registry/shared.ts` — **modify** — extend
   flattenSet (new param + enrichment) and applyQuery (new filter)
9. `apps/registry-viewer/src/registry/types/types-index.ts` — **modify** —
   add `twistPattern?: string` to FlatCard
10. `apps/registry-viewer/src/App.vue` — **modify** — fetch + wire filter
    + pass assignments to flattenSet

---

## Contract

### The 8 Twist Patterns (Locked)

| Slug | Label | Emoji | Order |
|---|---|---|---|
| `reveal-or-punish` | Reveal or Punish | 🔍 | 10 |
| `stack-and-escalate` | Stack & Escalate | 📈 | 20 |
| `chained-reveals` | Chained Reveals | 🔗 | 30 |
| `bystander-capture` | Bystander Capture | 🧑‍🤝‍🧑 | 40 |
| `hero-ko` | Hero KO | 💀 | 50 |
| `wound-distribution` | Wound Distribution | 🩸 | 60 |
| `hand-disruption` | Hand Disruption | ✋ | 70 |
| `board-manipulation` | Board Manipulation | 🔀 | 80 |

### Pattern Stability Contract

- Pattern slugs are **immutable identifiers** once released. Renaming a
  slug is a breaking change that invalidates all assignments and requires
  a migration.
- Labels, descriptions, and emoji may evolve without breaking assignments.
- `order` values are stable but may be adjusted to insert new patterns
  between existing ones (gap-numbering by 10s enables this).

### Zod Schemas

```typescript
export const TWIST_PATTERN_SLUGS = [
  "reveal-or-punish",
  "stack-and-escalate",
  "chained-reveals",
  "bystander-capture",
  "hero-ko",
  "wound-distribution",
  "hand-disruption",
  "board-manipulation",
] as const;

export const TwistPatternSlugSchema = z.enum(TWIST_PATTERN_SLUGS);

export const SchemeTwistPatternSchema = z.object({
  slug: TwistPatternSlugSchema,
  label: z.string(),
  emoji: z.string(),
  order: z.number(),
  description: z.string(),
});

export const SchemeTwistPatternsIndexSchema = z.array(SchemeTwistPatternSchema);

export const SchemeTwistAssignmentsSchema = z.record(
  z.string(),
  TwistPatternSlugSchema,
);
```

The `z.enum` on the assignments schema catches typos and invalid slugs at
parse time. Runtime drift guards remain as defense-in-depth.

### FlatCard Extension

```typescript
interface FlatCard {
  // ... existing fields ...
  twistPattern?: string;  // pattern slug from assignments map; undefined for non-scheme or unassigned
}
```

### flattenSet Signature

```typescript
flattenSet(set, schemeTwistAssignments?: Map<string, string>)
```

- If `undefined` → skip enrichment
- If present → look up `{setAbbr}/{scheme.slug}` and populate
  `twistPattern`
- Must NOT read from singleton internally — keep `flattenSet` pure

### applyQuery Filter

- New parameter: `twistPatterns?: Set<string>`
- Filters are AND-combined
- When twist-patterns filter is active: implicitly enforces
  `cardType = "scheme"` — non-scheme cards are excluded regardless of
  the cardType filter state
- Within schemes: only those with `twistPattern ∈ selected set` AND
  passing all existing filters are included
- Unassigned schemes pass when no pattern filter is active; excluded
  when any pattern IS active

### Filter Chip Interaction Model

- Multi-select enabled (`Set<string>`)
- Toggle adds/removes a pattern from the active selection
- Multiple patterns may be active simultaneously (OR within twist
  filter, AND with other filters)
- Empty selection = filter inactive (all cards pass)

### Primary Pattern Tie-Break Rules (for classification)

When a scheme's twist combines multiple patterns:

1. Prefer the mechanic described **first** in the twist text
2. If unclear, prefer the mechanic with the largest gameplay impact
3. If still ambiguous, use precedence: `reveal-or-punish` >
   `stack-and-escalate` > `chained-reveals` > `bystander-capture` >
   `hero-ko` > `wound-distribution` > `hand-disruption` >
   `board-manipulation`

### Drift Guards (Client-Side, Non-Blocking)

At runtime, warn on data inconsistencies — never throw:

- Every assignment value must exist in the pattern slugs list
- Pattern slugs must be unique
- Duplicate scheme keys: last write wins + warn
- Unknown scheme ext_ids (not found in loaded card data): warn, ignore
- All violations use `console.warn` with prefix `[scheme-twist]`

### Static Consistency Contract (Test-Time)

The following must be enforced by tests, not only by runtime drift guards:

1. Every assignment value MUST match one of the 8 `TWIST_PATTERN_SLUGS`
   (enforced by `z.enum` at parse time)
2. Pattern slugs in `scheme-twist-patterns.json` MUST be unique
3. Pattern list MUST be ordered by `order` ascending (10 → 80)
4. `assignmentCount + unassignedCount === totalSchemeCount` (coverage
   accounting; see Assignment Coverage below)

### Pattern Ordering Contract

All UI surfaces (filter chips, badge lists, tooltips) MUST sort patterns
by `order` ascending. No component may rely on JSON array insertion order.

### Assignment Coverage Contract

- Total schemes in the dataset: 191 (baseline from 40 sets)
- Coverage must be >= 95% (at least 182 assigned)
- Any intentionally unassigned schemes MUST be listed in a `_unassigned`
  comment block at the top of `scheme-twist-assignments.json` with a
  reason per entry (e.g., "ambiguous multi-pattern", "unique mechanic")
- Tests MUST assert: assigned count + documented unassigned count ===
  total scheme count

### Partial Failure Handling

- Patterns fetch fails, assignments succeeds → filter UI disabled (no
  pattern list to render chips), badges disabled, assignments discarded
- Assignments fails, patterns succeeds → chips render (informational)
  but no filtering effect and no badges (no data to match)
- Both fail → fully degraded mode (no twist UI elements at all)
- All cases: log `[scheme-twist]` warning, never throw

### Performance Constraints

- Convert assignments JSON object to `Map<string, string>` once at load
- Pattern lookups during flattening: O(1) via `Map.get`
- No per-render recomputation of assignments map or pattern list

### Visual Rules

- Use existing chip CSS variables (`--chip-bg`, `--chip-border`,
  `--chip-text`)
- Pattern-specific color variation NOT required in v1 — emoji is the
  primary differentiator

---

## Acceptance Criteria

- [ ] `scheme-twist-patterns.json` contains exactly 8 entries with all
  required fields (slug, label, emoji, order, description)
- [ ] `scheme-twist-assignments.json` covers >= 95% of 191 schemes;
  unassigned schemes documented with reasons
- [ ] `assignmentCount + unassignedCount === totalSchemeCount` (test)
- [ ] Every assignment value passes `TwistPatternSlugSchema` validation
  (enforced by `z.enum`)
- [ ] Zod schemas validate both data files without error
- [ ] `schemeTwistClient.ts` fetches, validates, and caches data per
  singleton-factory pattern
- [ ] `flattenSet` receives assignments map as explicit parameter and
  enriches scheme FlatCards
- [ ] `applyQuery` AND-combines twist-pattern filter with existing filters
- [ ] Filter chip ribbon shows emoji + label + badge count per pattern
- [ ] Filter ribbon visible only when scheme card type is relevant
- [ ] Active twist filter implicitly enforces scheme-only (non-scheme
  cards excluded)
- [ ] Filter chips are multi-select (toggle individual patterns)
- [ ] UI sorts patterns by `order`, not array position
- [ ] CardDetail shows twist-pattern badge with tooltip for scheme cards
- [ ] CardGrid shows subtle twist-pattern overlay on scheme tiles
- [ ] Degraded mode handles all three partial-failure cases (patterns-only
  fail, assignments-only fail, both fail) per §Partial Failure Handling
- [ ] Drift guards warn on data inconsistencies, never throw
- [ ] No `game-engine` imports in registry-viewer
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` passes
- [ ] `pnpm -r build` exits 0

---

## Verification Steps

### Unit / Integration Tests

1. **Zod validation:** `SchemeTwistPatternsIndexSchema` validates the 8
   pattern entries; `SchemeTwistAssignmentsSchema` validates assignments
2. **flattenSet enrichment:** scheme card with a matching assignment gets
   `twistPattern` populated; non-scheme card does not
3. **flattenSet no-assignment:** scheme card not in assignments map gets
   `twistPattern = undefined`
4. **flattenSet pure:** calling with `undefined` assignments → no
   `twistPattern` fields populated
5. **applyQuery:** twist-pattern filter includes matching schemes, excludes
   non-matching, excludes non-scheme cards when active
6. **Drift guard:** invalid pattern slug rejected by `z.enum` at parse
   time; runtime guard logs `console.warn` with `[scheme-twist]` prefix
7. **Static consistency:** pattern slugs unique, ordered by `order`
   ascending, coverage accounting correct
8. **Partial failure:** patterns-fail → no filter UI; assignments-fail →
   chips without filtering; both-fail → fully degraded

### Local Dev Smoke Test

1. Start `pnpm --filter registry-viewer dev`
2. Browse schemes — filter chips visible, badge counts populated
3. Click a pattern chip — grid filters to matching schemes
4. Click a scheme card — detail shows pattern badge with tooltip
5. Console: no `[scheme-twist]` warnings with valid data
6. Layer check: `grep -r "game-engine" apps/registry-viewer/` returns 0

---

## Definition of Done

**Data:**
- [ ] `data/metadata/scheme-twist-patterns.json` — 8 entries, valid,
  ordered by `order` ascending
- [ ] `data/metadata/scheme-twist-assignments.json` — >= 182 entries
  (>= 95% coverage); unassigned documented with reasons
- [ ] Coverage accounting test: assigned + unassigned === total

**Registry Schema:**
- [ ] `TWIST_PATTERN_SLUGS` const array + `TwistPatternSlugSchema`
  (`z.enum`) exported
- [ ] `SchemeTwistAssignmentsSchema` uses `TwistPatternSlugSchema` as
  value type (catches invalid slugs at parse time)
- [ ] 3+ Zod schemas + inferred types exported from `packages/registry/`

**Client:**
- [ ] `schemeTwistClient.ts` follows singleton-factory pattern
- [ ] `.safeParse()` at fetch boundary, warn + degrade on failure

**FlatCard + flattenSet:**
- [ ] `twistPattern?: string` on FlatCard
- [ ] `flattenSet(set, schemeTwistAssignments?)` — param-based, pure
- [ ] O(1) Map lookup per scheme card

**Filter:**
- [ ] `applyQuery` accepts `twistPatterns?: Set<string>`, AND-combined
- [ ] Active twist filter implicitly enforces scheme-only
- [ ] Filter chips are multi-select (toggle per chip)
- [ ] Filter ribbon visible and functional

**UI:**
- [ ] CardDetail badge (emoji + label + tooltip)
- [ ] CardGrid badge (subtle overlay)
- [ ] Dark-theme scoped CSS using existing variables

**Guardrails:**
- [ ] Drift guards active (console.warn, never throw)
- [ ] No game-engine imports: `grep -r "game-engine" apps/registry-viewer/`
  returns 0
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` passes
- [ ] `pnpm -r build` exits 0

---

## Assignment Workflow (for populating assignments file)

For each file in `data/cards/*.json`:

1. Iterate `cards[]`
2. Filter where `type === "scheme"`
3. Find the ability line starting with `"Twist:"`
4. Classify using the heuristics below + primary pattern tie-break rules
5. Write `ext_id → pattern slug` to assignments file

**Classification heuristics** (read actual twist text):

- **reveal-or-punish**: "Each player reveals..." or conditional reveal
  with penalty fallback
- **stack-and-escalate**: "Put this Twist next to the Scheme" or effects
  referencing "for each Twist" / "equal to the number of Twists"
- **chained-reveals**: "Play the top card/cards of the Villain Deck"
- **bystander-capture**: "captures N Bystanders" or villain captures
- **hero-ko**: "KO" + "from the HQ" / "hero" / "from your hand"
- **wound-distribution**: "gains a Wound" / "each player gains"
- **hand-disruption**: "discard" + player hands
- **board-manipulation**: "moves" / "swap" / "city" / villain
  repositioning

Do NOT: infer from card name, use flavor text, or skip reading twist text.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ |
| 2 | Assumes lists all prerequisites with status | ✅ |
| 3 | Context explains motivation | ✅ |
| 4 | Scope (In)/(Out) present and closed | ✅ |
| 5 | Files Expected to Change matches contract | ✅ |
| 6 | Contract section present | ✅ |
| 7 | Acceptance Criteria are testable bullets | ✅ |
| 8 | Verification Steps are operator-runnable | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | No game-engine imports in viewer-only WP | ✅ |
| 11 | Layer boundary respected | ✅ |
| 12 | Commit prefix convention identified | ✅ |
| 13 | Determinism N/A (no engine, no G mutation) | N/A |
| 14 | Phase/turn transitions N/A | N/A |
| 15 | Move validation contract N/A | N/A |
| 16 | Rule execution pipeline N/A | N/A |
| 17 | Vision alignment N/A — viewer-only, no §17.1 triggers | N/A |
| 18 | Persistence boundary N/A | N/A |
| 19 | Drift detection N/A (no canonical arrays) | N/A |
| 20 | Funding surface N/A | N/A |
| 21 | API catalog N/A (no server endpoints) | N/A |
