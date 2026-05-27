# WP-184 — Card Mechanical Pattern Taxonomies for Registry Viewer

## Goal

Add four mechanical-pattern taxonomies to `cards.legendary-arena.com` so users
browsing heroes, villains, henchmen, and masterminds can see and filter by what
those cards mechanically DO. Surface each taxonomy as filter chips, card-detail
badges, and grid-tile badges. This is a **registry-viewer-only** change — no
engine, no game logic.

---

## Assumes

- WP-183 ✅ — Scheme Twist Pattern Taxonomy landed 2026-05-27 (EC-210). The
  singleton-factory + Zod `.safeParse()` + `Promise.allSettled` + filter-chip
  + `FlatCard` enrichment pattern is established. Reuse its Zod schema shape
  (`CardPatternSchema`), generalize `SchemeTwistFilter.vue` into
  `PatternFilter.vue`, and extend `schemeTwistClient.ts` into
  `cardPatternsClient.ts`.
- WP-083 ✅ — Fetch-Time Schema Validation for Registry-Viewer Clients landed.
- WP-170 ✅ — Card Count Display landed. `flattenSet()` accepts enrichment
  params.
- `packages/registry/src/schema.ts` — canonical Zod schema location. WP-183
  added `SchemeTwistPatternSchema` / `TwistPatternSlugSchema` (reuse shape).
- `apps/registry-viewer/src/registry/shared.ts` — contains `flattenSet()` and
  `applyQuery()`; this WP extends both.
- `apps/registry-viewer/src/registry/types/types-index.ts` — contains `FlatCard`
  (already has `twistPattern?: string` from WP-183; this WP adds
  `mechanicalPattern?: string`).
- R2 metadata bucket at `https://images.barefootbetters.com/metadata/` already
  hosts `card-abilities.json`, `glossary.json`, `scheme-twist-patterns.json`,
  `scheme-twist-assignments.json`.
- Live card data at `data/cards/*.json` (40 sets) — heroes, villains, henchmen,
  masterminds are all reachable.
- **Drafting baseline:** `origin/main @ 0e2558f` (2026-05-27).

---

## Context

The registry viewer groups 318 heroes, 126 villain groups, 46 henchman groups,
and 106 masterminds into undifferentiated walls. Users (and game designers
evaluating which decks to build) can't quickly answer "which heroes draw cards?"
or "which masterminds wound on every strike?" The mechanical-pattern
classification is manual (operator-reviewed, assigned at hero/villain/henchman/
mastermind level — not per individual card) and stored as static metadata.

This WP extends the exact same pipeline WP-183 established for schemes: static
JSON on R2, per-taxonomy Zod enum validation, singleton-cached clients,
`FlatCard` enrichment via `flattenSet`, AND-combined filter. The primary added
complexity over WP-183 is four parallel taxonomies instead of one, requiring
strict cross-taxonomy isolation.

**Session prompt length justification:** the session prompt for this WP exceeds
the 200-line guideline because the bulk of execution work is 596 manual entity
classifications. The session prompt includes the 4 taxonomy tables (quick-reference
slug lookup during classification) and per-entity classification heuristics for
heroes, villains, henchmen, and masterminds. These are operational context for
the executor and cannot be compressed without losing classification fidelity.

---

## Scope (In) / (Out)

### In

- **Data files** — 8 new JSON files under `data/metadata/`:
  - `hero-patterns.json` / `hero-pattern-assignments.json`
  - `villain-patterns.json` / `villain-pattern-assignments.json`
  - `henchman-patterns.json` / `henchman-pattern-assignments.json`
  - `mastermind-patterns.json` / `mastermind-pattern-assignments.json`
- **Registry Zod schemas** — per-taxonomy slug enums + assignment record
  schemas + type exports (added to `schema.ts` alongside WP-183's schemas)
- **Registry-viewer client** — `cardPatternsClient.ts` singleton-factory (8
  parallel fetches, `Promise.allSettled`, per-taxonomy getters)
- **FlatCard extension** — optional `mechanicalPattern?: string` field
- **flattenSet modification** — new `patternAssignmentsByType?` structured
  parameter; explicit `cardType`-keyed routing; pure (no singleton reads)
- **applyQuery modification** — new `mechanicalPatterns?: Set<string>` filter;
  single-cardType enforcement; AND-combined with existing filters
- **Filter UI** — generalize `SchemeTwistFilter.vue` into `PatternFilter.vue`
  (or create it new if WP-183's component is not cleanly generalizable)
- **CardDetail badge** — mechanical-pattern badge with emoji + label + tooltip
- **CardGrid badge** — subtle mechanical-pattern overlay on tiles
- **App.vue wiring** — 8 parallel fetches, reactive refs, wire to flattenSet
  and filter components

### Out

- Engine changes of any kind
- Scheme twist patterns (WP-183 scope, already shipped)
- Automated NLP classification (manual assignment only)
- Per-card classification (heroes classified at hero level across 4-card set)
- Multi-pattern tagging per entity (v1: one pattern or unassigned)
- `DECISIONS.md` entries (no engine architecture impact)

---

## Files Expected to Change

1. `data/metadata/hero-patterns.json` — **new** — 10 hero pattern definitions
2. `data/metadata/hero-pattern-assignments.json` — **new** — 318 hero → pattern
3. `data/metadata/villain-patterns.json` — **new** — 8 villain pattern definitions
4. `data/metadata/villain-pattern-assignments.json` — **new** — 126 villain group → pattern
5. `data/metadata/henchman-patterns.json` — **new** — 6 henchman pattern definitions
6. `data/metadata/henchman-pattern-assignments.json` — **new** — 46 henchman group → pattern
7. `data/metadata/mastermind-patterns.json` — **new** — 8 mastermind pattern definitions
8. `data/metadata/mastermind-pattern-assignments.json` — **new** — 106 mastermind → pattern
9. `packages/registry/src/schema.ts` — **modify** — add 4 slug enums + 4
   assignment schemas + shared `CardPatternSchema` reuse
10. `apps/registry-viewer/src/lib/cardPatternsClient.ts` — **new** — 8-fetch
    singleton R2 client
11. `apps/registry-viewer/src/components/PatternFilter.vue` — **new** —
    generic pattern chip ribbon (generalizes SchemeTwistFilter)
12. `apps/registry-viewer/src/components/CardDetail.vue` — **modify** —
    mechanical-pattern badge
13. `apps/registry-viewer/src/components/CardGrid.vue` — **modify** —
    mechanical-pattern tile badge
14. `apps/registry-viewer/src/registry/shared.ts` — **modify** — extend
    `flattenSet` + `applyQuery`
15. `apps/registry-viewer/src/App.vue` — **modify** — fetch, wire filter,
    pass assignments to flattenSet

> **§5 justification:** 8 of the 15 files are static JSON data files requiring
> content authoring only (no code logic). The code surface is 7 files,
> comparable to WP-183's 10-file pass.

---

## Contract

### The Four Taxonomies (Locked)

#### Hero Patterns (10 entries)

| Slug | Label | Emoji | Order | Description |
|---|---|---|---|---|
| `draw-engine` | Draw Engine | 🃏 | 10 | Abilities that draw extra cards from your deck |
| `attack-boost` | Attack Power | ⚔️ | 20 | Flat or conditional +attack bonuses |
| `recruit-boost` | Recruit Power | 💰 | 30 | Flat or conditional +recruit bonuses |
| `class-synergy` | Class Synergy | 🎨 | 40 | Abilities gated by hero class (`[hc:X]`) conditions |
| `team-synergy` | Team Synergy | 🤝 | 50 | Abilities that scale with or require same-team heroes |
| `deck-thin` | Deck Thinning | ✂️ | 60 | KO cards from hand or discard to slim your deck |
| `reveal-manipulate` | Deck Manipulation | 🔮 | 70 | Reveal, rearrange, or filter top cards of your deck |
| `wound-interact` | Wound Interaction | 🩹 | 80 | KO wounds, benefit from wounds, or wound immunity |
| `bystander-interact` | Bystander Rescuer | 🧑 | 90 | Rescue bystanders or scale based on rescued bystanders |
| `keyword-carrier` | Keyword Specialist | 🏷️ | 100 | Primary identity is a set keyword (Berserk, Teleport, etc.) |

#### Villain Patterns (8 entries)

| Slug | Label | Emoji | Order | Description |
|---|---|---|---|---|
| `fight-draw` | Fight: Draw | 🃏 | 10 | Defeating this villain draws cards |
| `fight-wound-others` | Fight: Wound Others | 🩸 | 20 | Defeating this villain wounds other players |
| `fight-ko-hero` | Fight: KO Hero | 💀 | 30 | Defeating this villain costs you a hero |
| `fight-rescue` | Fight: Rescue | 🧑 | 40 | Defeating this villain rescues bystanders |
| `fight-gain-hero` | Fight: Gain Hero | 🦸 | 50 | Defeating this villain gives you a free hero |
| `fight-recruit` | Fight: Recruit | 💰 | 60 | Defeating this villain gives recruit points |
| `ambush-capture` | Ambush: Capture | 🧑‍🤝‍🧑 | 70 | This villain captures bystanders on entry |
| `ambush-cascade` | Ambush: Cascade | 🔗 | 80 | This villain plays additional villain deck cards on entry |

#### Henchman Patterns (6 entries)

| Slug | Label | Emoji | Order | Description |
|---|---|---|---|---|
| `hench-ko-hero` | Fight: KO Hero | 💀 | 10 | Defeating costs you one of your heroes |
| `hench-recruit` | Fight: Recruit | 💰 | 20 | Defeating gives recruit points |
| `hench-draw` | Fight: Draw | 🃏 | 30 | Defeating draws extra cards at end of turn |
| `hench-deck-filter` | Fight: Deck Filter | 🔮 | 40 | Defeating lets you reveal/KO/rearrange top of deck |
| `hench-gain-as-hero` | Fight: Gain as Hero | 🦸 | 50 | This henchman becomes a hero card in your deck |
| `hench-conditional` | Fight: Conditional | ❓ | 60 | Reveal-or-punish gate (reveal X or suffer penalty) |

#### Mastermind Patterns (8 entries)

| Slug | Label | Emoji | Order | Description |
|---|---|---|---|---|
| `strike-wound` | Strike: Wounds | 🩸 | 10 | Each player gains wounds (often with a reveal gate) |
| `strike-discard` | Strike: Discard | ✋ | 20 | Each player discards cards or discards down to N |
| `strike-ko-hero` | Strike: KO Heroes | 💀 | 30 | KO heroes from hand, discard, or HQ |
| `strike-capture` | Strike: Capture | 🧑‍🤝‍🧑 | 40 | Mastermind captures bystanders as shields |
| `strike-spawn` | Strike: Spawn | 👹 | 50 | The Strike card itself enters the city as a villain |
| `strike-deck-disrupt` | Strike: Deck Disruption | 📚 | 60 | Cards placed on top of deck, deck manipulation |
| `strike-escalate` | Strike: Escalate | 📈 | 70 | Strikes stack — effects grow with each successive strike |
| `strike-board` | Strike: Board Effect | 🔀 | 80 | Villains escape, move, or board state changes |

### Cross-Taxonomy Pattern Contract

All pattern taxonomies share the same definition shape:

```typescript
// Reuse / align with WP-183's SchemeTwistPatternSchema shape
export const CardPatternSchema = z.object({
  slug: z.string(),
  label: z.string(),
  emoji: z.string(),
  order: z.number(),
  description: z.string(),
});
export const CardPatternsIndexSchema = z.array(CardPatternSchema);
```

Invariants (all taxonomies):
- `slug`: unique within its own taxonomy; must not be reused across taxonomies
- `emoji`: stable visual identifier; must not change once published to R2
- `order`: numeric sort key (ascending, gap-numbered by 10s)
- `label` / `description`: may evolve; slugs are the stable identity key

All UI components MUST sort patterns by `order`, never by JSON insertion order.

### Per-Taxonomy Slug Enums (Locked)

```typescript
export const HeroPatternSlug = z.enum([
  "draw-engine", "attack-boost", "recruit-boost", "class-synergy",
  "team-synergy", "deck-thin", "reveal-manipulate", "wound-interact",
  "bystander-interact", "keyword-carrier",
]);

export const VillainPatternSlug = z.enum([
  "fight-draw", "fight-wound-others", "fight-ko-hero", "fight-rescue",
  "fight-gain-hero", "fight-recruit", "ambush-capture", "ambush-cascade",
]);

export const HenchmanPatternSlug = z.enum([
  "hench-ko-hero", "hench-recruit", "hench-draw",
  "hench-deck-filter", "hench-gain-as-hero", "hench-conditional",
]);

export const MastermindPatternSlug = z.enum([
  "strike-wound", "strike-discard", "strike-ko-hero", "strike-capture",
  "strike-spawn", "strike-deck-disrupt", "strike-escalate", "strike-board",
]);

export const HeroPatternAssignmentsSchema = z.record(z.string(), HeroPatternSlug);
export const VillainPatternAssignmentsSchema = z.record(z.string(), VillainPatternSlug);
export const HenchmanPatternAssignmentsSchema = z.record(z.string(), HenchmanPatternSlug);
export const MastermindPatternAssignmentsSchema = z.record(z.string(), MastermindPatternSlug);
```

The `z.enum` on assignment schemas catches cross-taxonomy slug leakage and typos
at parse time. Runtime drift guards remain as defense-in-depth.

### FlatCard Extension

```typescript
interface FlatCard {
  // ... existing fields including twistPattern? from WP-183 ...
  mechanicalPattern?: string; // pattern slug; undefined for non-hero/villain/henchman/mastermind or unassigned
}
```

### flattenSet Signature (Locked)

```typescript
flattenSet(set: CardSet, patternAssignmentsByType?: {
  hero?: Map<string, string>;
  villain?: Map<string, string>;
  henchman?: Map<string, string>;
  mastermind?: Map<string, string>;
  scheme?: Map<string, string>; // WP-183 field; threaded through unchanged
}): FlatCard[]
```

Routing is explicit by `cardType` key — no dynamic dispatch. Must NOT read from
singleton internally — keep `flattenSet` pure. Each `Map` is built once at
`onMounted` and passed in; O(1) lookup per card.

### applyQuery Filter Contract

- New parameter: `mechanicalPatterns?: Set<string>`
- When active: exactly ONE `cardType` must also be active; otherwise the
  `mechanicalPatterns` filter is silently ignored and a `[card-patterns]` warning
  is logged (`// why: cross-taxonomy pattern filter has undefined semantics`)
- Cards of other types are excluded when `mechanicalPatterns` is active
- Unassigned cards pass when no pattern filter is active; excluded when any
  pattern IS active
- AND-combined with all existing filters

### Assignment Invariant

Each entity maps to exactly one pattern slug (or has no entry in the assignments
file). Multiple slugs per entity are forbidden in v1. The `z.record(..., SlugEnum)`
schema enforces this structurally.

### Coverage Contract

```
assignmentCount + unassignedCount == totalEntityCount
```

| Taxonomy | Total | Minimum assigned |
|---|---|---|
| heroes | 318 | ≥ 302 (≥ 95%) |
| villains | 126 | ≥ 120 (≥ 95%) |
| henchmen | 46 | 46 (100%) |
| masterminds | 106 | ≥ 101 (≥ 95%) |

Intentionally unassigned entities MUST be documented in a `_unassigned` comment
block at the top of the assignments file with a reason per entry.

### Classification Tie-Break Rules (All Taxonomies)

When multiple patterns apply with equal weight, resolve deterministically:

1. Prefer the mechanic appearing most frequently across the card text
2. If still tied, prefer the effect on the rarest card (highest rarity = highest impact)
3. If still ambiguous, use `order` precedence — lowest `order` wins

Document any tie-break requiring rule 2 or 3 with a comment in the assignments
JSON (e.g., `"// tie-break: order"`).

### Drift Guards (Client-Side, Non-Blocking)

At runtime, warn-only — never throw. All warnings use prefix `[card-patterns]`:

- Assignment slug must exist in the corresponding taxonomy's slug enum (hero
  assignments must not reference villain slugs, etc.)
- Keys in an assignments file with no matching card in the loaded dataset → warn
- Duplicate slugs within a taxonomy definition → warn
- Any violations do not block rendering

### Partial Failure Isolation

Each taxonomy loads independently via `Promise.allSettled`. A failed fetch for
one taxonomy MUST NOT affect others. Only the failed taxonomy loses its chips
and badges — all other taxonomies continue to function.

### Slug Stability Contract

Pattern slugs are permanent identifiers once published to R2. They must not be
renamed after initial upload. Labels, descriptions, and emoji may evolve freely.
Adding new slugs requires updating both the JSON definitions file and the Zod
enum.

### UI Rendering Constraint

- Max 10 chips per row; chips wrap to a second line on overflow
- No horizontal scrolling in v1
  (`// why: avoids hidden patterns on smaller screens`)

### Pattern Ordering Contract

All UI surfaces (filter chips, badges, tooltips) MUST sort patterns by `order`
ascending. No component may rely on JSON array insertion order.

### Performance Constraints

- Convert assignments JSON objects to `Map<string, string>` once at load
- Pattern lookups during flattening: O(1) via `Map.get`
- No per-render recomputation of assignments map or pattern list

---

## Acceptance Criteria

- [ ] Each of the 4 pattern definition files contains the exact slugs, labels,
  emojis, and `order` values in the locked tables above
- [ ] Each assignment file covers its minimum count; unassigned entries documented
- [ ] `assignmentCount + unassignedCount === totalEntityCount` for each taxonomy (test)
- [ ] Every assignment value passes its per-taxonomy `z.enum` validation
- [ ] `cardPatternsClient.ts` fetches all 8 files via `Promise.allSettled`,
  validates with per-taxonomy schemas, and caches per singleton-factory pattern
- [ ] `flattenSet` receives `patternAssignmentsByType?` and routes by `cardType`
  key; pure (no singleton reads inside)
- [ ] `applyQuery` AND-combines `mechanicalPatterns?` filter; single-cardType
  enforcement is in logic (not only hidden via UI)
- [ ] Filter chip ribbon visible only when exactly one card type is active
- [ ] UI sorts patterns by `order`, not array position
- [ ] CardDetail shows mechanical-pattern badge (emoji + label + tooltip)
- [ ] CardGrid shows subtle mechanical-pattern overlay on tiles
- [ ] Failed taxonomy disables only its own chips/badges; others unaffected
- [ ] Drift guards warn on data inconsistencies, never throw
- [ ] `grep -r "game-engine" apps/registry-viewer/` returns 0
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` passes
- [ ] `pnpm -r build` exits 0

---

## Verification Steps

### Unit / Integration Tests

1. **Zod validation:** each `CardPatternsIndexSchema` validates its 4 data files;
   each `*PatternAssignmentsSchema` validates its assignments file
2. **flattenSet enrichment:** hero card with matching assignment gets
   `mechanicalPattern` populated; villain card uses villain map, not hero map
3. **flattenSet cross-taxonomy isolation:** hero assignment slug not accepted by
   `VillainPatternAssignmentsSchema` (Zod rejects at parse time)
4. **flattenSet pure:** calling with `undefined` → no `mechanicalPattern` fields
5. **applyQuery:** pattern filter with single cardType active filters correctly;
   pattern filter with no cardType active is ignored (warning logged)
6. **Coverage accounting:** assigned + unassigned === total for each taxonomy
7. **Drift guard:** invalid slug rejected by `z.enum`; runtime guard logs
   `console.warn` with `[card-patterns]` prefix
8. **Partial failure:** hero fetch fails → villain/henchman/mastermind still load

### Local Dev Smoke Test

1. Start `pnpm --filter registry-viewer dev`
2. Select "Hero" card type chip → hero pattern chips appear; click one → grid
   filters to matching heroes
3. Select both "Hero" and "Villain" → pattern chips disappear
4. Click a hero card → detail shows pattern badge with tooltip
5. Console: no `[card-patterns]` warnings with valid data
6. Layer check: `grep -r "game-engine" apps/registry-viewer/` returns 0

---

## Definition of Done

**Data:**
- [ ] 8 JSON files under `data/metadata/` present and valid
- [ ] Each coverage minimum met; unassigned entities documented
- [ ] Coverage accounting test: assigned + unassigned === total per taxonomy

**Registry Schemas:**
- [ ] 4 slug enums + 4 assignment schemas + type exports in `packages/registry/`
- [ ] Each assignment schema uses the taxonomy-specific `z.enum` as value type

**Client:**
- [ ] `cardPatternsClient.ts` follows singleton-factory pattern; `.safeParse()`
  at fetch boundary; degrades gracefully per taxonomy

**FlatCard + flattenSet:**
- [ ] `mechanicalPattern?: string` on `FlatCard`
- [ ] `flattenSet(set, patternAssignmentsByType?)` — structured param, pure, explicit routing

**Filter:**
- [ ] `applyQuery` accepts `mechanicalPatterns?: Set<string>`, AND-combined
- [ ] Single-cardType enforcement in logic (not just UI gating)
- [ ] Filter chips multi-select (toggle per chip); sorted by `order`
- [ ] Chip wrap, no horizontal scroll

**UI:**
- [ ] CardDetail badge (emoji + label + tooltip)
- [ ] CardGrid badge (subtle overlay)
- [ ] Dark-theme scoped CSS using existing variables

**Guardrails:**
- [ ] Drift guards active (`[card-patterns]` prefix, warn only)
- [ ] No game-engine imports: `grep -r "game-engine" apps/registry-viewer/` returns 0
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` passes
- [ ] `pnpm -r build` exits 0
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date and commit SHA

---

## Assignment Workflow

For each of the 4 entity types, read `data/cards/*.json`:

**Heroes:** Iterate `cards[]` where `type === "hero"`. For each distinct hero
name (across the 4-card set), read all `abilities[]` text entries. Classify by
the dominant mechanical role using the heuristics in §Classification Guidelines.

**Villains:** Iterate `cards[]` where `type === "villain"`. Group by villain
group slug. Read Fight reward + Ambush text. Classify by the most distinctive
mechanic.

**Henchmen:** Iterate `cards[]` where `type === "henchman"`. Group by henchman
group slug. Usually one ability text shared across copies.

**Masterminds:** Iterate `cards[]` where `type === "mastermind"`. Read the
Master Strike text specifically.

Classification heuristics are detailed in the session prompt for this WP
(`docs/ai/invocations/session-wp184-card-pattern-taxonomies.md §2` and `§6`).

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ |
| 2 | Assumes lists all prerequisites with status | ✅ |
| 3 | Context explains motivation | ✅ |
| 4 | Scope (In)/(Out) present and closed | ✅ |
| 5 | Files Expected to Change — 15 files; 8 are static JSON data (no code logic); code surface is 7 files, comparable to WP-183. Justified inline. | ✅ |
| 6 | Contract section present with all locked values | ✅ |
| 7 | Acceptance Criteria are testable, binary bullets | ✅ |
| 8 | Verification Steps are operator-runnable | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | No game-engine imports in viewer-only WP | ✅ |
| 11 | Layer boundary respected (registry-viewer + registry only) | ✅ |
| 12 | Commit prefix convention: `EC-NNN:` + `SPEC:` per 01.3 | ✅ |
| 13 | Determinism N/A (no engine, no G mutation) | N/A |
| 14 | Phase/turn transitions N/A | N/A |
| 15 | Move validation contract N/A | N/A |
| 16 | Rule execution pipeline N/A | N/A |
| 17 | Vision alignment N/A — viewer-only, no §17.1 triggers | N/A |
| 18 | Persistence boundary N/A | N/A |
| 19 | Drift detection N/A (no canonical arrays) | N/A |
| 20 | Funding surface N/A | N/A |
| 21 | API catalog N/A (no server endpoints) | N/A |
