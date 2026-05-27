# Session Prompt — WP-183: Scheme Twist Pattern Taxonomy for Registry Viewer

Add a "Scheme Twist Pattern" taxonomy to `cards.legendary-arena.com` so
users browsing schemes can see and filter by the mechanical pattern each
scheme's twist follows. This is a **registry-viewer-only** change — no
engine, no game logic.

---

## 1 — Problem

There are 191 schemes across 40 card sets. Their twist abilities collapse
into ~8 mechanical patterns, but the registry viewer shows them as an
undifferentiated wall of scheme cards. Users (and game designers evaluating
which schemes to implement) can't quickly find "all schemes that KO heroes
from the HQ" or "all schemes where effects escalate with twist count."

## 2 — The 8 Twist Patterns

| Slug | Label | Emoji | Description |
|---|---|---|---|
| `reveal-or-punish` | Reveal or Punish | 🔍 | Each player reveals a card matching a condition or suffers a penalty |
| `stack-and-escalate` | Stack & Escalate | 📈 | Effects scale with the number of twists already played |
| `chained-reveals` | Chained Reveals | 🔗 | Play top N cards from the villain deck |
| `bystander-capture` | Bystander Capture | 🧑‍🤝‍🧑 | Villain at a location captures N bystanders |
| `hero-ko` | Hero KO | 💀 | KO heroes from HQ, hand, or discard |
| `wound-distribution` | Wound Distribution | 🩸 | Each player gains N wounds |
| `hand-disruption` | Hand Disruption | ✋ | Each player discards N cards |
| `board-manipulation` | Board Manipulation | 🔀 | Move villains/heroes between city spaces |

## 3 — Design: Static Metadata File + Filter Chips

### 3a — Data file

Create `data/metadata/scheme-twist-patterns.json`:

```json
[
  {
    "slug": "reveal-or-punish",
    "label": "Reveal or Punish",
    "emoji": "🔍",
    "order": 10,
    "description": "Each player reveals a card matching a condition or suffers a penalty"
  },
  ...
]
```

This follows the same shape as `data/metadata/card-abilities.json` (slug,
label, emoji, order) plus a `description` field for tooltips. No `matchers`
array — assignment is manual, not regex-derived.

### 3b — Per-scheme assignment file

Create `data/metadata/scheme-twist-assignments.json`:

```json
{
  "core/midtown-bank-robbery": "bystander-capture",
  "core/secret-invasion-of-the-skrull-shapeshifters": "reveal-or-punish",
  "core/legacy-virus-the": "reveal-or-punish",
  "core/negative-zone-prison-breakout": "chained-reveals",
  "core/portals-to-the-dark-dimension": "stack-and-escalate",
  "core/replace-earths-leaders-with-killbots": "board-manipulation",
  "core/super-hero-civil-war": "hero-ko",
  "core/unleash-the-power-of-the-cosmic-cube": "wound-distribution",
  ...
}
```

Key format: `{setAbbr}/{scheme-slug}` (matches the engine's scheme ext_id
format). Value: one of the 8 pattern slugs.

**Populate ALL 191 schemes.** Read each scheme's twist text from its
`cards[].abilities` array (the line starting with "Twist:") and classify
it into the best-matching pattern. When a scheme's twist combines
multiple patterns (e.g., "reveal or gain a wound, then play a villain
card"), assign the **primary** pattern — the one that best characterizes
the twist's central mechanic. Use your judgment; perfection isn't
required — the user will review.

If a scheme's twist text genuinely doesn't fit any of the 8 patterns,
leave it out of the assignments file. The UI should handle unassigned
schemes gracefully (no badge, passes all filters when no pattern filter
is active).

### 3c — Upload to R2

Both files need to be uploaded to the R2 metadata bucket at:
- `https://images.barefootbetters.com/metadata/scheme-twist-patterns.json`
- `https://images.barefootbetters.com/metadata/scheme-twist-assignments.json`

**Do not upload to R2 yourself.** Just create the local files under
`data/metadata/`. The operator handles R2 uploads separately.

### 3d — Registry-viewer client

Create `apps/registry-viewer/src/lib/schemeTwistClient.ts` following the
singleton-factory pattern of `cardAbilitiesClient.ts` and
`glossaryClient.ts`:

- Fetch both JSON files from R2 (URLs derived from `metadataBaseUrl` in
  `registry-config.json`)
- Validate with Zod schemas (`.safeParse(...)` — warn + degrade on
  failure, never throw)
- Export:
  - `getSchemeTwistPatterns(): Promise<SchemeTwistPattern[]>` — the 8
    pattern entries
  - `getSchemeTwistAssignments(): Promise<Map<string, string>>` — scheme
    ext_id → pattern slug
- Singleton-cached (module-scope promise, fetched once)
- Non-blocking — `Promise.allSettled` in App.vue; card view works if
  fetch fails

### 3e — Zod schemas

Add to `packages/registry/src/schema.ts` (or a new sibling file if the
main file is large):

```typescript
export const SchemeTwistPatternSchema = z.object({
  slug: z.string(),
  label: z.string(),
  emoji: z.string(),
  order: z.number(),
  description: z.string(),
});

export const SchemeTwistPatternsIndexSchema = z.array(SchemeTwistPatternSchema);

export const SchemeTwistAssignmentsSchema = z.record(z.string(), z.string());
```

Export the inferred types too (`SchemeTwistPattern`, etc.).

### 3f — FlatCard extension

Add an optional `twistPattern?: string` field to `FlatCard` in the
registry types. In `flattenSet()` (shared.ts), look up the scheme's
ext_id (`{setAbbr}/{scheme.slug}`) in the assignments map and populate
the field.

`flattenSet` must receive the assignments map as an explicit parameter:

```typescript
flattenSet(set, schemeTwistAssignments?: Map<string, string>)
```

- If `undefined` → skip enrichment (no pattern field populated)
- If present → look up and enrich
- Must NOT read from the singleton internally — keep `flattenSet` pure

### 3g — Filter UI

Add a "Scheme Twist Pattern" filter chip ribbon to the Cards view,
**visible only when `cardType === "scheme"` filter is active** (or when
no card-type filter is active — whatever feels natural). Follow the
`AbilityEffectFilter.vue` component pattern:

- Horizontal chip strip with emoji + label per pattern
- Toggle on/off to filter the grid
- Badge count showing how many schemes match each pattern
- Scoped dark-theme CSS matching existing chip styles

This could be a new `SchemeTwistFilter.vue` component or reuse
`AbilityEffectFilter.vue` if the shape is compatible. The existing
component expects `CardAbilityEntry[]` with `matchers` — the twist
patterns have no matchers, so a new component is probably cleaner.

**Visual rules:** Use existing chip CSS variables (`--chip-bg`,
`--chip-border`, `--chip-text`). Pattern-specific color variation is
NOT required in v1 — the emoji is the primary differentiator.

### 3h — CardDetail badge

When viewing a scheme in `CardDetail.vue`, show the twist pattern as a
colored badge/chip near the card name (similar to how card type badges
work). Include the emoji and label. Show the description as a tooltip.

### 3i — Grid badge

In `CardGrid.vue`, for scheme cards that have a `twistPattern`, show a
small badge overlay on the tile (emoji only, or emoji + short label).
Keep it subtle — the tile is already compact.

## 4 — Filter integration in applyQuery

In `shared.ts`'s `applyQuery()`, add twist-pattern filtering:

- New filter parameter: `twistPatterns?: Set<string>` (set of selected
  pattern slugs)
- When non-empty, filter cards to those whose `twistPattern` is in the
  set
- Unassigned schemes (no `twistPattern`) pass through when no pattern
  filter is active; are excluded when any pattern IS active

Filters are **AND-combined**. When the twist-patterns filter is active:
- Only cards matching `type === "scheme"` AND `twistPattern ∈ selected
  set` AND passing all existing filters are included
- Non-scheme cards are excluded when any twist-pattern filter is active

## 5 — App.vue wiring

In `App.vue`'s `onMounted`:

- Call `getSchemeTwistPatterns()` and `getSchemeTwistAssignments()` in
  parallel alongside existing fetches
- Store results as reactive refs
- Pass assignments map to `flattenSet()` calls (or build a lookup
  composable)
- Wire the filter chips to `applyQuery`

Non-blocking: if R2 fetch fails, log a warning and degrade — no badges,
no filter ribbon, cards still display.

## 6 — File Plan

| File | Action |
|---|---|
| `data/metadata/scheme-twist-patterns.json` | **New** — 8 pattern entries |
| `data/metadata/scheme-twist-assignments.json` | **New** — 191 scheme → pattern mappings |
| `packages/registry/src/schema.ts` | **Modify** — add Zod schemas + type exports |
| `apps/registry-viewer/src/lib/schemeTwistClient.ts` | **New** — R2 fetcher, singleton-cached |
| `apps/registry-viewer/src/components/SchemeTwistFilter.vue` | **New** — filter chip ribbon |
| `apps/registry-viewer/src/components/CardDetail.vue` | **Modify** — twist pattern badge |
| `apps/registry-viewer/src/components/CardGrid.vue` | **Modify** — twist pattern tile badge |
| `apps/registry-viewer/src/registry/shared.ts` | **Modify** — extend FlatCard, flattenSet, applyQuery |
| `apps/registry-viewer/src/registry/types/` | **Modify** — FlatCard type extension |
| `apps/registry-viewer/src/App.vue` | **Modify** — fetch + wire filter + pass to components |

## 7 — Classifying All 191 Schemes

To populate `scheme-twist-assignments.json`, read each set's JSON file
under `data/cards/*.json`. For each scheme, find the "Twist:" line in
`cards[].abilities` and classify by pattern:

**Classification heuristics** (read the actual twist text — these are
guidelines, not regex rules):

- **reveal-or-punish**: "Each player reveals..." or "reveal a [type]
  hero or..." — the core mechanic is a conditional reveal with a
  penalty fallback
- **stack-and-escalate**: "Put this Twist next to the Scheme" or effects
  that reference "for each Twist" / "equal to the number of Twists" —
  the twist count itself drives the effect's magnitude
- **chained-reveals**: "Play the top card/cards of the Villain Deck" —
  the twist's effect is forcing additional villain deck reveals
- **bystander-capture**: "captures N Bystanders" or "each Villain
  captures" — bystanders move to villains
- **hero-ko**: "KO" + "from the HQ" / "hero" / "from your hand" —
  permanent hero removal
- **wound-distribution**: "gains a Wound" / "each player gains" — wound
  cards enter player decks
- **hand-disruption**: "discard" + player hands — cards leave hands
  involuntarily
- **board-manipulation**: "moves" / "swap" / "city" / villain
  repositioning — spatial effects on the city row or HQ

Some schemes combine patterns. Assign the **primary** one using these
tie-break rules:

1. Prefer the mechanic described **first** in the twist text
2. If unclear, prefer the mechanic with the largest gameplay impact
3. If still ambiguous, use this precedence:
   `reveal-or-punish` > `stack-and-escalate` > `chained-reveals` >
   `bystander-capture` > `hero-ko` > `wound-distribution` >
   `hand-disruption` > `board-manipulation`

When truly ambiguous after all three rules, pick the pattern a player
would use to describe the scheme in one sentence.

## 8 — Drift Guards (Client-Side, Non-Blocking)

At runtime, warn on data inconsistencies — never throw:

- Every assignment value must exist in the pattern slugs list
- Pattern slugs must be unique
- Duplicate scheme keys: last write wins + warn
- Unknown scheme ext_ids (not found in loaded card data): warn, ignore

All violations use `console.warn` with prefix `[scheme-twist]`.

## 9 — Performance Constraints

- Convert the assignments JSON object to `Map<string, string>` once at
  load time
- Pattern lookups during flattening must be O(1) (Map.get)
- No per-render recomputation of the assignments map or pattern list

## 10 — Assignment Workflow (Deterministic)

For each file in `data/cards/*.json`:

1. Iterate `cards[]`
2. Filter where `type === "scheme"`
3. Find the ability line starting with `"Twist:"`
4. Classify using §7 heuristics + primary pattern tie-break rules
5. Write `ext_id → pattern slug` to assignments file

Do NOT:
- Infer pattern from the card name
- Use flavor text for classification
- Skip reading the full twist text

## 11 — Constraints

- **Layer boundary**: registry-viewer may import `registry` (Zod
  schemas). It must NOT import `game-engine`.
- **No engine changes**: this is purely a data + UI feature for the card
  browser.
- **Degraded mode**: if R2 fetch fails, no badges and no filter — but
  card view still works.
- **Dark theme**: all new UI elements must use the existing dark theme
  CSS variables and scoped styles.
- **Permissive validation**: `.safeParse()` at fetch boundary, warn +
  skip on failure, never throw.
- `pnpm --filter registry-viewer build` must exit 0.
- `pnpm --filter registry-viewer test` must pass (if tests exist).
- `pnpm -r build` must exit 0.

## 12 — Governance

- This is a registry-viewer feature — no WP/EC in the game-engine
  governance system required. If you want to track it as WP-183 / EC-210
  that's fine, but it's optional for a viewer-only change.
- Commit prefix: use whatever the registry-viewer convention is (check
  recent `git log` for `registry-viewer:` prefixed commits).
- No `DECISIONS.md` entry needed (no engine architecture impact).

## 13 — Out of Scope

- Master Strike patterns (future — same approach, different taxonomy)
- Villain fight-effect patterns (future)
- Engine resolver implementation (that's WP-182)
- Automated twist-text parsing / NLP classification (manual assignment
  is fine for 191 entries)
- Scheme setup instruction display (already handled by existing
  abilities text)
