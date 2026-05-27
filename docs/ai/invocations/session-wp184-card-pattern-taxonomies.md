# Session Prompt — WP-184: Card Mechanical Pattern Taxonomies for Registry Viewer

Add four new mechanical-pattern taxonomies to `cards.legendary-arena.com`
so users can browse, filter, and understand heroes, villains, henchmen,
and masterminds by what they mechanically DO. This is a
**registry-viewer-only** change — no engine, no game logic.

This is a sibling to WP-183 (Scheme Twist Pattern taxonomy). The
implementation pattern is identical: static metadata files + Zod
schemas + singleton R2 fetchers + filter chips + card badges.

---

## 1 — Problem

The registry viewer shows 318 heroes, 126 villain groups, 46 henchman
groups, and 106 masterminds as undifferentiated walls of cards. Users
can't answer "which heroes draw cards?" or "which villains capture
bystanders?" without reading every card. Pattern taxonomies let users
filter by mechanical role.

---

## 2 — The Four Taxonomies

### 2a — Hero Patterns (10 categories)

Heroes are classified by their **primary mechanical role** — what the
hero's card set is designed to DO for your deck.

| Slug | Label | Emoji | Description |
|---|---|---|---|
| `draw-engine` | Draw Engine | 🃏 | Abilities that draw extra cards from your deck |
| `attack-boost` | Attack Power | ⚔️ | Flat or conditional +attack bonuses |
| `recruit-boost` | Recruit Power | 💰 | Flat or conditional +recruit bonuses |
| `class-synergy` | Class Synergy | 🎨 | Abilities gated by hero class (`[hc:X]` conditions) |
| `team-synergy` | Team Synergy | 🤝 | Abilities that scale with or require same-team heroes |
| `deck-thin` | Deck Thinning | ✂️ | KO cards from hand or discard to slim your deck |
| `reveal-manipulate` | Deck Manipulation | 🔮 | Reveal, rearrange, or filter top cards of your deck |
| `wound-interact` | Wound Interaction | 🩹 | KO wounds, benefit from wounds, or wound immunity |
| `bystander-interact` | Bystander Rescuer | 🧑 | Rescue bystanders or scale based on rescued bystanders |
| `keyword-carrier` | Keyword Specialist | 🏷️ | Primary identity is a set keyword (Berserk, Teleport, Soaring Flight, etc.) |

**Assignment rule:** Classify each HERO (not each card) by the dominant
pattern across their 4-card set (Common×2, Uncommon, Rare). Most heroes
have a clear primary identity. When a hero blends patterns (e.g., draws
cards AND has team synergy), pick the one that best describes the hero's
role in a deck.

### 2b — Villain Patterns (8 categories)

Villains are classified by what their **Fight reward** and **Ambush/Escape
effects** primarily do.

| Slug | Label | Emoji | Description |
|---|---|---|---|
| `fight-draw` | Fight: Draw | 🃏 | Defeating this villain draws cards |
| `fight-wound-others` | Fight: Wound Others | 🩸 | Defeating this villain wounds other players (reveal-or-punish) |
| `fight-ko-hero` | Fight: KO Hero | 💀 | Defeating this villain costs you a hero (KO from your cards) |
| `fight-rescue` | Fight: Rescue | 🧑 | Defeating this villain rescues bystanders |
| `fight-gain-hero` | Fight: Gain Hero | 🦸 | Defeating this villain gives you a free hero or the villain becomes a hero |
| `fight-recruit` | Fight: Recruit | 💰 | Defeating this villain gives recruit points or a free card |
| `ambush-capture` | Ambush: Capture | 🧑‍🤝‍🧑 | This villain captures bystanders when entering the city |
| `ambush-cascade` | Ambush: Cascade | 🔗 | This villain plays additional villain deck cards on entry |

**Assignment rule:** Classify each VILLAIN GROUP (not each individual
card) by the dominant pattern across the group's 4 cards. When Fight and
Ambush are both prominent, pick the pattern that makes the villain
mechanically distinctive.

### 2c — Henchman Patterns (6 categories)

Henchmen are simpler — usually one Fight effect shared across copies.

| Slug | Label | Emoji | Description |
|---|---|---|---|
| `hench-ko-hero` | Fight: KO Hero | 💀 | Defeating costs you one of your heroes |
| `hench-recruit` | Fight: Recruit | 💰 | Defeating gives recruit points |
| `hench-draw` | Fight: Draw | 🃏 | Defeating draws extra cards at end of turn |
| `hench-deck-filter` | Fight: Deck Filter | 🔮 | Defeating lets you reveal/KO/rearrange top of deck |
| `hench-gain-as-hero` | Fight: Gain as Hero | 🦸 | This henchman becomes a hero card in your deck |
| `hench-conditional` | Fight: Conditional | ❓ | Reveal-or-punish gate (reveal X or suffer penalty) |

### 2d — Mastermind Patterns (8 categories)

Masterminds are classified by their **Master Strike** effect — the thing
that fires when a Master Strike card is revealed from the villain deck.

| Slug | Label | Emoji | Description |
|---|---|---|---|
| `strike-wound` | Strike: Wounds | 🩸 | Each player gains wounds (often with a reveal gate) |
| `strike-discard` | Strike: Discard | ✋ | Each player discards cards or discards down to N |
| `strike-ko-hero` | Strike: KO Heroes | 💀 | KO heroes from hand, discard, or HQ |
| `strike-capture` | Strike: Capture | 🧑‍🤝‍🧑 | Mastermind captures bystanders as shields |
| `strike-spawn` | Strike: Spawn | 👹 | The Strike card itself enters the city as a villain |
| `strike-deck-disrupt` | Strike: Deck Disruption | 📚 | Cards placed on top of deck, deck manipulation |
| `strike-escalate` | Strike: Escalate | 📈 | Strikes stack — effects grow with each successive strike |
| `strike-board` | Strike: Board Effect | 🔀 | Villains escape, move, or board state changes |

---

## 3 — Implementation (Same Pattern as WP-183)

### 3a — Data files

Create 8 files under `data/metadata/`:

| File | Contents |
|---|---|
| `hero-patterns.json` | 10 pattern definitions (slug, label, emoji, order, description) |
| `hero-pattern-assignments.json` | 318 hero → pattern mappings (keyed by `{setAbbr}/{hero-slug}`) |
| `villain-patterns.json` | 8 pattern definitions |
| `villain-pattern-assignments.json` | 126 villain group → pattern mappings (keyed by `{setAbbr}/{group-slug}`) |
| `henchman-patterns.json` | 6 pattern definitions |
| `henchman-pattern-assignments.json` | 46 henchman group → pattern mappings (keyed by `{setAbbr}/{group-slug}`) |
| `mastermind-patterns.json` | 8 pattern definitions |
| `mastermind-pattern-assignments.json` | 106 mastermind → pattern mappings (keyed by `{setAbbr}/{mastermind-slug}`) |

Pattern definition shape (same as WP-183's scheme-twist-patterns):

```json
{
  "slug": "draw-engine",
  "label": "Draw Engine",
  "emoji": "🃏",
  "order": 10,
  "description": "Abilities that draw extra cards from your deck"
}
```

Assignment shape (same as WP-183's scheme-twist-assignments):

```json
{
  "core/spider-man": "draw-engine",
  "core/wolverine": "attack-boost",
  ...
}
```

### 3b — Classifying all cards

For each card type, read every set's JSON file under `data/cards/*.json`.
Examine the `abilities` text arrays and classify by pattern:

**Heroes:** Read the 4 cards' abilities for each hero. What is the hero's
primary deck role? A Spider-Man who draws 2 cards on his Rare is a
`draw-engine`. A Wolverine who gives +3 attack on his Uncommon is
`attack-boost`.

**Villains:** Read all cards in the villain group. What's the Fight
reward? What's the Ambush? Focus on the most distinctive mechanic.

**Henchmen:** Usually one ability shared across 3-10 copies. Straightforward.

**Masterminds:** Read the Master Strike text. What happens when the
strike fires?

When a card genuinely doesn't fit, leave it out of the assignments.
The UI handles unassigned cards gracefully.

### 3c — Zod schemas

Add to `packages/registry/src/schema.ts` (or reuse the schema from
WP-183 if it's already landed — the pattern-definition shape is
identical):

```typescript
// Reuse SchemeTwistPatternSchema shape for all card pattern taxonomies
export const CardPatternSchema = z.object({
  slug: z.string(),
  label: z.string(),
  emoji: z.string(),
  order: z.number(),
  description: z.string(),
});

export const CardPatternsIndexSchema = z.array(CardPatternSchema);
export const CardPatternAssignmentsSchema = z.record(z.string(), z.string());
```

If WP-183 already defined `SchemeTwistPatternSchema` with the same shape,
reuse it or factor it into a shared `CardPatternSchema`. Don't duplicate.

### 3d — Registry-viewer client

Create `apps/registry-viewer/src/lib/cardPatternsClient.ts`:

- Fetch all 8 JSON files from R2 (parallel, `Promise.allSettled`)
- Validate with Zod
- Export getters per card type:
  - `getHeroPatterns()` / `getHeroPatternAssignments()`
  - `getVillainPatterns()` / `getVillainPatternAssignments()`
  - `getHenchmanPatterns()` / `getHenchmanPatternAssignments()`
  - `getMastermindPatterns()` / `getMastermindPatternAssignments()`
- Singleton-cached, non-blocking
- If WP-183's `schemeTwistClient.ts` is already landed, factor out a
  shared `fetchPatternData(patternsUrl, assignmentsUrl)` helper to avoid
  5× copy-paste

### 3e — FlatCard extension

Add an optional `mechanicalPattern?: string` field to `FlatCard`. In
`flattenSet()`, look up the card's ext_id in the appropriate assignments
map based on `cardType`:

- `cardType === 'hero'` → hero assignments
- `cardType === 'villain'` → villain assignments
- `cardType === 'henchman'` → henchman assignments
- `cardType === 'mastermind'` → mastermind assignments
- `cardType === 'scheme'` → scheme assignments (WP-183, if landed)

`flattenSet` receives a single combined assignments map or a
per-card-type lookup function. Keep `flattenSet` pure — no singleton
reads inside.

### 3f — Filter UI

Add a "Mechanical Pattern" filter chip ribbon to the Cards view. Behavior:

- When a single card type is filtered (e.g., user selects "Hero" chip),
  show the pattern chips for that card type
- When no card type is filtered, hide the pattern chips (too many to show
  all at once)
- When multiple card types are filtered, hide the pattern chips (mixed
  taxonomy doesn't make sense)
- Chip ribbon uses the same visual style as WP-183's scheme twist filter

If WP-183's `SchemeTwistFilter.vue` is already landed, generalize it into
a `PatternFilter.vue` that accepts any `CardPattern[]` taxonomy. Or create
card-type-specific filter components — whatever is cleaner.

### 3g — CardDetail + CardGrid badges

Same as WP-183: emoji + label badge on detail view, subtle emoji badge on
grid tiles. Use the pattern's `description` as tooltip text.

### 3h — applyQuery integration

Extend `applyQuery()` filter:

- New filter parameter: `mechanicalPatterns?: Set<string>`
- When active, filter to cards whose `mechanicalPattern` is in the set
- Unassigned cards pass when no pattern filter is active; excluded when
  any pattern IS active
- Filters are AND-combined with existing filters

---

## 4 — App.vue Wiring

In `onMounted`:

- Fetch all 4 pattern taxonomies + assignment maps in parallel (8 fetches
  via `Promise.allSettled`, alongside existing fetches)
- Store as reactive refs
- Pass to `flattenSet()` enrichment
- Wire to filter components

Non-blocking: if any R2 fetch fails, that card type gets no badges and
no filter — other card types still work.

---

## 5 — File Plan

| File | Action |
|---|---|
| `data/metadata/hero-patterns.json` | **New** — 10 pattern entries |
| `data/metadata/hero-pattern-assignments.json` | **New** — 318 hero mappings |
| `data/metadata/villain-patterns.json` | **New** — 8 pattern entries |
| `data/metadata/villain-pattern-assignments.json` | **New** — 126 villain group mappings |
| `data/metadata/henchman-patterns.json` | **New** — 6 pattern entries |
| `data/metadata/henchman-pattern-assignments.json` | **New** — 46 henchman group mappings |
| `data/metadata/mastermind-patterns.json` | **New** — 8 pattern entries |
| `data/metadata/mastermind-pattern-assignments.json` | **New** — 106 mastermind mappings |
| `packages/registry/src/schema.ts` | **Modify** — add/reuse pattern Zod schemas |
| `apps/registry-viewer/src/lib/cardPatternsClient.ts` | **New** — R2 fetcher for all 4 taxonomies |
| `apps/registry-viewer/src/components/PatternFilter.vue` | **New** — generic pattern chip ribbon |
| `apps/registry-viewer/src/components/CardDetail.vue` | **Modify** — pattern badge |
| `apps/registry-viewer/src/components/CardGrid.vue` | **Modify** — pattern tile badge |
| `apps/registry-viewer/src/registry/shared.ts` | **Modify** — FlatCard extension, flattenSet, applyQuery |
| `apps/registry-viewer/src/App.vue` | **Modify** — fetch + wire + pass to components |

---

## 6 — Classification Guidelines

### Heroes (318 total)

Read each hero's 4 cards (abilities arrays). Classify by dominant role:

- **draw-engine**: Rare or Uncommon says "Draw" as the primary payoff
- **attack-boost**: Main contribution is +attack (flat or scaling)
- **recruit-boost**: Main contribution is +recruit
- **class-synergy**: Most abilities gated by `[hc:X]` conditions
- **team-synergy**: Abilities scale with same-team heroes played
- **deck-thin**: Primary value is KO'ing starter cards
- **reveal-manipulate**: Reveal top N, filter, rearrange
- **wound-interact**: KO wounds or benefit from having wounds
- **bystander-interact**: Rescue or scale from bystanders
- **keyword-carrier**: Identity IS the keyword (Berserk, Teleport, etc.)

### Villains (126 groups)

Read all cards in each villain group. Focus on Fight reward + Ambush:

- **fight-draw**: "Fight: Draw N cards"
- **fight-wound-others**: "Fight: Each player... gains a Wound"
- **fight-ko-hero**: "Fight: KO one of your Heroes"
- **fight-rescue**: "Fight: Rescue N Bystanders"
- **fight-gain-hero**: "Fight: Gain this as a Hero" or "Gain a Hero from HQ"
- **fight-recruit**: "Fight: You get +N recruit"
- **ambush-capture**: "Ambush: captures N Bystanders"
- **ambush-cascade**: "Ambush: Play top card of Villain Deck"

### Henchmen (46 groups)

Usually one ability text. Direct classification:

- **hench-ko-hero**: "Fight: KO one of your Heroes" (~40% of all henchmen)
- **hench-recruit**: "Fight: You get +N recruit"
- **hench-draw**: "Fight: Draw an extra card"
- **hench-deck-filter**: "Fight: Look at / reveal top of deck"
- **hench-gain-as-hero**: "Fight: Gain this as a Hero"
- **hench-conditional**: "Fight: Reveal X or suffer penalty"

### Masterminds (106 total)

Read the Master Strike text:

- **strike-wound**: "Each player gains a Wound" or reveal-or-wound
- **strike-discard**: "discard" / "discard down to"
- **strike-ko-hero**: "KO a Hero from" hand/discard/HQ
- **strike-capture**: "captures a Bystander"
- **strike-spawn**: "enters the city as a Villain"
- **strike-deck-disrupt**: "puts cards on top of deck"
- **strike-escalate**: "Stack this Strike" / effects scale with strikes
- **strike-board**: villains escape / move / board state changes

---

## 7 — Constraints

- **Layer boundary**: registry-viewer may import `registry` (Zod
  schemas). Must NOT import `game-engine`.
- **No engine changes**: purely data + UI for the card browser.
- **Degraded mode**: if any R2 fetch fails, that taxonomy is absent —
  no badges, no filter — but cards still display.
- **Dark theme**: all new UI elements use existing dark theme CSS.
- **Permissive validation**: `.safeParse()`, warn + skip, never throw.
- `pnpm --filter registry-viewer build` must exit 0.
- `pnpm -r build` must exit 0.

## 8 — Coordination with WP-183

If WP-183 (Scheme Twist Patterns) has already landed:

- Reuse its Zod schemas if they match this shape
- Generalize `SchemeTwistFilter.vue` into `PatternFilter.vue`
- Extend `schemeTwistClient.ts` into `cardPatternsClient.ts` (or merge)
- Use the same `twistPattern` → `mechanicalPattern` field on FlatCard

If WP-183 has NOT landed yet, this WP can ship independently. The scheme
twist taxonomy is just a 5th card type in this same framework. Whoever
lands second refactors to share code.

## 9 — Out of Scope

- Engine resolver implementation (WP-182)
- Scheme twist patterns (WP-183)
- Automated NLP classification (manual is fine)
- Per-card classification (heroes are classified at hero level, not per
  individual card in the 4-card set)
- Pattern combination / multi-tag (one pattern per entity in v1)
