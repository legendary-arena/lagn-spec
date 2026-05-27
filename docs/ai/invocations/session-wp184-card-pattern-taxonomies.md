# Session Prompt — WP-184: Card Mechanical Pattern Taxonomies for Registry Viewer

**WP:** [WP-184-card-mechanical-pattern-taxonomies.md](../work-packets/WP-184-card-mechanical-pattern-taxonomies.md)  
**EC:** [EC-211-card-mechanical-pattern-taxonomies.checklist.md](../execution-checklists/EC-211-card-mechanical-pattern-taxonomies.checklist.md)  
**Pre-flight:** READY TO EXECUTE | **Copilot:** PASS  
**Drafting baseline:** `origin/main @ 0e2558f` (2026-05-27)

Add four new mechanical-pattern taxonomies to `cards.legendary-arena.com`
so users can browse, filter, and understand heroes, villains, henchmen,
and masterminds by what they mechanically DO. This is a
**registry-viewer-only** change — no engine, no game logic.

This is a sibling to WP-183 (Scheme Twist Pattern taxonomy). The
implementation pattern is identical: static metadata files + Zod
schemas + singleton R2 fetchers + filter chips + card badges.

---

## Authority Chain (Read Order)

Before starting, read in this order:

1. `.claude/CLAUDE.md`
2. `docs/ai/ARCHITECTURE.md` — §Layer Boundary (registry-viewer + registry only)
3. `.claude/rules/architecture.md` — import rules quick reference
4. `docs/ai/execution-checklists/EC-211-card-mechanical-pattern-taxonomies.checklist.md` — **read first**
5. `docs/ai/work-packets/WP-184-card-mechanical-pattern-taxonomies.md` — authoritative design
6. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code guide
7. `packages/registry/src/schema.ts` — existing Zod schemas (WP-183's twist schemas are models)
8. `apps/registry-viewer/src/registry/shared.ts` — `flattenSet` + `applyQuery` (read current signatures)
9. `apps/registry-viewer/src/registry/types/types-index.ts` — `FlatCard` (has `twistPattern?` already)
10. `apps/registry-viewer/src/lib/schemeTwistClient.ts` — singleton-factory model to replicate
11. `apps/registry-viewer/src/components/SchemeTwistFilter.vue` — filter chip model to generalize
12. `apps/registry-viewer/src/App.vue` — WP-183 wiring pattern to extend

## Pre-Execution Checks

Before writing any code:

- [ ] `git rev-parse HEAD` — confirm starting from `0e2558f` or later
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0 (baseline)
- [ ] `pnpm --filter registry-viewer build` exits 0 (baseline)
- [ ] `pnpm -r build` exits 0 (baseline)
- [ ] EC-211 locked values match what you see in `schema.ts` / `shared.ts` / `types-index.ts`

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

## 3 — Implementation Summary

> Full specification in WP-184 §Scope (In) / §Contract and EC-211 §Files to Produce.

- **8 JSON data files** under `data/metadata/` — 4 patterns files + 4 assignments
  files. Keyed by `{setAbbr}/{entity-slug}`. Pattern definition shape: `{ slug,
  label, emoji, order, description }`. Assignment shape: `{ "core/spider-man": "draw-engine" }`.
- **Zod schemas** in `packages/registry/src/schema.ts` — reuse `CardPatternSchema`
  from WP-183's shape; add 4 per-taxonomy slug enums (`HeroPatternSlug`, etc.) +
  4 typed assignment record schemas. Locked slugs are in EC-211 Locked Values.
- **`cardPatternsClient.ts`** — singleton-factory, 8 parallel fetches via
  `Promise.allSettled`, per-taxonomy getters. Model: `schemeTwistClient.ts`.
- **`FlatCard.mechanicalPattern?: string`** — enriched by `flattenSet` via
  explicit `patternAssignmentsByType?` param (keyed: `hero`, `villain`,
  `henchman`, `mastermind`, `scheme`). Pure — no singleton reads inside.
- **`applyQuery` + `mechanicalPatterns?: Set<string>`** — single-cardType
  enforcement in logic (not just UI). Warn + ignore if multi-type.
- **`PatternFilter.vue`** — generic chip ribbon; generalize `SchemeTwistFilter.vue`.
- **CardDetail + CardGrid badges** — same pattern as WP-183.
- **App.vue** — 8 parallel fetches in `onMounted`; pass `patternAssignmentsByType`
  to `flattenSet`; wire filter; each taxonomy isolated.

---

## 4 — Classification Guidelines

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

## 5 — Constraints, Contracts, and Out of Scope

> All contracts, guardrails, coverage requirements, tie-break rules, partial
> failure semantics, slug stability, and out-of-scope boundaries are locked
> in **WP-184 §Contract** and **EC-211 §Guardrails**. Read those before coding.

Key enforcements for quick reference:
- `grep -r "game-engine" apps/registry-viewer/` MUST return 0
- Each `*PatternAssignmentsSchema` MUST use per-taxonomy `z.enum`, not `z.string()`
- `applyQuery` single-cardType enforcement is in logic, not just UI gating
- WP-183 ✅ has already landed — generalize `SchemeTwistFilter.vue` into
  `PatternFilter.vue`; `FlatCard` already has `twistPattern?`

---

## Post-Merge Close Ritual (REQUIRED)

After the operator merges the PR via the GitHub UI, run from inside the
execution worktree:

```pwsh
node scripts/prune-empty-claude-branch.mjs --verify-current
```

Expected: `VERIFY PASS: ...`. If `VERIFY FAIL`, STOP — fix before
continuing.

Then delete the branch (local + remote):

```pwsh
git branch -D claude/<branch-name>
git push origin --delete claude/<branch-name>
```

Then from the canonical clone, confirm clean state:

```pwsh
node scripts/prune-empty-claude-branch.mjs --report
```

Expected: silent (no output).
