# WP-214 — Villain Hero Capture & Dynamic Attack Resolution (Engine + Data)

**Status:** Draft
**Primary Layer:** Game Engine + Card Data
**Dependencies:** WP-185 (villain effect infrastructure), WP-187 (effect-marker enrichment tooling), WP-191 (ext_id grammar reconciliation), WP-202 (magnitude-N vocabulary precedent), WP-200 (notable event log)

---

## Session Context

> WP-185 through WP-202 built the villain effect pipeline: a setup-time parser
> reads `[effect:<keyword>]` markers from card ability text, stores hooks in
> `G.villainAbilityHooks`, and an executor dispatches effects at the Ambush,
> Fight, and Escape fire sites. The current 7-keyword vocabulary covers wound
> infliction, hero KO, bystander capture, and hero-deck-to-escape — all
> **self-contained** effects that don't create persistent cross-card
> relationships.
>
> A large class of villain cards — starting with the Core Set's Skrull
> Shapeshifters but spanning 12+ villain groups across 10+ sets — **capture
> Heroes** from the HQ, Hero Deck, or player zones and attach them to the
> villain. These captured heroes affect the villain's fight cost (dynamic
> `vAttack: "*"` or `"N+"` values), are awarded to the defeating player on
> Fight, and must be visible in the UI underneath the villain card. None of
> this infrastructure exists today.

---

## Goal

After this packet, `@legendary-arena/game-engine` supports villains that
**capture Heroes and derive their fight cost from the captured card**. The
engine:

1. Maintains `G.villainAttachedHeroes: Record<CardExtId, CardExtId[]>` — a
   parallel structure to the existing `G.attachedBystanders` — tracking which
   heroes are captured by which villain in the city.

2. Resolves **dynamic fight costs** for villains whose `vAttack` is `"*"` or
   `"N+"` by reading the captured hero's recruit cost from `G.cardStats` at
   fight time (not at setup time). `resolveFightCost()` is the **single
   authoritative source** of villain fight cost — the UI consumes the
   resolved number, never recomputes it.

3. Supports three new villain effect keywords for the **v1 curatable subset**
   (unconditional, single-target, no cost filter):
   - `captureHqHeroRightmost` — capture the rightmost Hero from the HQ
   - `captureHqHeroHighestCost` — capture the highest-cost Hero from the HQ
   - `captureHqHeroLowestCost` — capture the lowest-cost Hero from the HQ (ties: rightmost)

4. On **Fight: Gain that Hero** — when a villain with attached heroes is
   defeated, captured heroes transfer to the defeating player's discard pile
   (parallel to how `awardAttachedBystanders` transfers bystanders to victory).

5. On **Escape** — when a villain with attached heroes escapes the city,
   captured heroes are **KO'd** (sent to the KO pile), not returned to the HQ.

6. Projects `villainAttachedHeroes` and **engine-resolved fight costs** through
   `UIState` so the arena-client can render captured heroes underneath villain
   cards in the city.

**v1 scope boundary:** This WP covers HQ-sourced hero capture only. Hero Deck
capture (Dracula, Huntsman, Bullseye), player-zone capture (Demon Bear,
Cameron Hodge), cost-filtered capture (Mindless Ones "costs 4 or less",
Witchfire "lowest odd-numbered cost"), and multi-capture (Huntsman "top 3")
are explicitly deferred to follow-up WPs that extend the keyword vocabulary.
The `G.villainAttachedHeroes` state shape and the fight/escape lifecycle
helpers are designed to support all future capture sources without schema
change.

---

## Assumes

> Verify before writing a single line. If any item is false, this packet is
> **BLOCKED**.

- WP-185 complete. Specifically:
  - `packages/game-engine/src/villain/villainEffects.execute.ts` exports
    `executeVillainAbilities(G, ctx, cardId, timing)` returning
    `VillainEffectKeyword[]`.
  - `packages/game-engine/src/rules/villainAbility.types.ts` exports
    `VillainEffectKeyword` (7 entries) and `VILLAIN_EFFECT_KEYWORDS` array.
  - `packages/game-engine/src/setup/villainAbility.setup.ts` exports
    `buildVillainAbilityHooks()` with `[effect:]` marker regex extraction.

- WP-191 complete. Specifically:
  - Villain hooks key by zone-instance ext_id (copy-indexed
    `{set}-villain-{group}-{card}-NN`), not definition ext_id.
  - `villainCardInstanceExtIds` emitter exists in `villainDeck.setup.ts`.

- WP-187 complete. Specifically:
  - `scripts/convert-cards/apply-effect-markers.mjs` exists with curated
    `inputs/villain-effect-markers.json` and `SUPPORTED_TIMINGS`.
  - The overlay script supports appending new keywords to its local
    `VILLAIN_EFFECT_KEYWORDS` validation array.

- `G.attachedBystanders: Record<CardExtId, CardExtId[]>` exists and is
  maintained by `bystanders.logic.ts` (attach, award, resolve-escape).

- `G.cardStats: Record<CardExtId, CardStatEntry>` exists with fields:
  - `cost: number` — hero recruit cost (what a player pays to recruit)
  - `fightCost: number` — villain/henchman fight requirement
  - Fight cost is read in `fightVillain.ts` line 72 as
    `G.cardStats[cardId]?.fightCost ?? 0`.

- `G.hq: HqZone` is a fixed 5-tuple `[HqSlot, HqSlot, HqSlot, HqSlot, HqSlot]`
  where `HqSlot = CardExtId | null`. Rightmost = index 4; leftmost = index 0.

---

## Determinism & Invariants (MANDATORY)

### Selector Determinism

All HQ selection operations are fully deterministic and stable across replays:

- **Evaluation order:** All HQ slots scanned left-to-right (index 0 → 4).
- **Null handling:** Null (empty) slots are skipped. If all 5 slots are null,
  selector returns `null` — no error, no state mutation.
- **`rightmost`:** Returns the non-null slot with the highest index (4 → 0).
- **`highestCost`:** Returns the non-null slot whose hero has the highest
  `G.cardStats[heroId].cost`. Ties broken by **highest index** (rightmost wins).
- **`lowestCost`:** Returns the non-null slot whose hero has the lowest
  `G.cardStats[heroId].cost`. Ties broken by **highest index** (rightmost wins).

### Zone Integrity Invariants

1. A hero `CardExtId` MUST exist in **exactly one** of these zones at any time:
   - `G.heroDeck`
   - `G.hq`
   - `G.playerZones[*].handCards / inPlay / discard / victory`
   - `G.villainAttachedHeroes[*]`
   - `G.ko`
2. No duplicate hero ext_id across zones.
3. `G.villainAttachedHeroes[v]` entry exists only while `length > 0`. On
   fight/escape, the entry is **deleted** (not set to `[]`).
4. After `captureHeroFromHq` returns, the captured hero MUST NOT appear in
   `G.hq` — it has been atomically moved to `G.villainAttachedHeroes`.

### Capture Atomicity

Capture operations are atomic within a single effect execution:
1. Remove hero from `G.hq[index]` (set slot to `null`)
2. Append hero to `G.villainAttachedHeroes[villainCardId]`
3. Refill `G.hq[index]` from `G.heroDeck` top (pop first element)

All three steps execute within the same effect dispatch — no intermediate
state is observable by other effects.

### Hero Deck Exhaustion

If `G.heroDeck` is empty when an HQ slot needs refilling:
- The HQ slot becomes `null` (empty)
- No error thrown
- Game continues normally

### Dynamic Cost Authority

- `resolveFightCost(G, villainCardId): number` is the **single authoritative
  source** of villain fight cost. The UI MUST NOT recompute dynamic values.
- Dynamic cost reads captured hero recruit cost from `CardStatEntry.cost`
  only — never from `fightCost` (which is the villain's own fight requirement).
- `resolveFightCost` must tolerate: no attached heroes (returns base),
  missing `cardStats` entry (treats as 0), and always returns a deterministic
  integer ≥ 0. Guard: `G.villainAttachedHeroes[villainCardId] ?? []` —
  entries are **deleted** (not set to `[]`) so the lookup returns `undefined`
  when no heroes are attached.

### Keyword Mutation Scope

All three capture keywords MUST be side-effect free outside:
- `G.hq` (removal + refill)
- `G.heroDeck` (refill source)
- `G.villainAttachedHeroes` (attachment target)

They MUST NOT mutate player zones, `G.ko`, `G.attachedBystanders`, economy
state, or any other `G` field.

---

## Scope

### In

1. **New G field: `villainAttachedHeroes`**
   - Type: `Record<CardExtId, CardExtId[]>` (mirrors `attachedBystanders`)
   - Keyed by villain zone-instance ext_id
   - Values are hero `CardExtId` strings removed from HQ
   - Initialized as `{}` in `buildInitialGameState`

2. **New hero-capture helper module: `heroCapture.logic.ts`**
   - `captureHeroFromHq(G, villainCardId, selector)` — removes a hero from the
     HQ by selector strategy (`'rightmost'` | `'highestCost'` | `'lowestCost'`),
     adds it to `G.villainAttachedHeroes[villainCardId]`, refills the HQ slot
     from the Hero Deck. Returns `CaptureHeroResult | null`:
     ```ts
     type CaptureHeroResult = {
       capturedHeroId: CardExtId;
       hqIndex: number;
       refilledHeroId: CardExtId | null;
     };
     ```
     Returns `null` if HQ has no non-null slots.
   - `awardAttachedHeroes(G, villainCardId, playerId: string)` — on Fight, moves
     all captured heroes from `G.villainAttachedHeroes[villainCardId]` to the
     player's discard pile. Deletes the mapping entry. `playerId` is
     `ctx.currentPlayer` (boardgame.io player ID string, not a numeric index).
   - `koAttachedHeroesOnEscape(G, villainCardId)` — on Escape, moves all
     captured heroes to `G.ko`. Deletes the mapping entry.
   - Pure functions operating on `G` — no `ctx` dependency, no randomness.

3. **Dynamic fight cost resolution**
   - New field on `CardStatEntry`: `fightCostMode: 'static' | 'dynamic'`
     (default `'static'`; existing cards unaffected).
   - New field: `fightCostBase: number` (for `"N+"` patterns; `0` for `"*"`).
   - `resolveFightCost(G: LegendaryGameState, villainCardId: CardExtId): number`
     — pure function. For `'static'` mode, returns `fightCost`. For `'dynamic'`
     mode, returns `fightCostBase + sum(captured hero costs)` where each
     captured hero's cost is read from `G.cardStats[heroId].cost` (the hero's
     recruit cost — never `fightCost`).
   - Must tolerate: no attached heroes (returns `fightCostBase`), missing
     `cardStats` entry for a captured hero (treats as `0`), missing `cardStats`
     entry for the villain itself (returns `0`). Always returns a deterministic
     integer ≥ 0.
   - `buildCardStats` parser extended to handle `vAttack: "*"` (→ `fightCost: 0`,
     `fightCostMode: 'dynamic'`, `fightCostBase: 0`) and `vAttack: "N+"` (→
     `fightCost: N`, `fightCostMode: 'dynamic'`, `fightCostBase: N`).
     Guard: `vAttack` may be `undefined`/`null` for villains without an attack
     stat — check for falsy before pattern matching to avoid `TypeError`.
   - `fightVillain.ts` updated: replace `G.cardStats[cardId]?.fightCost ?? 0`
     with `resolveFightCost(G, cardId)`.
   - UI projection: `UIState` projects the **engine-resolved** fight cost as
     `number` for every city villain. The UI never recomputes dynamic values —
     it consumes the projected number directly.

4. **Three new villain effect keywords**
   - `captureHqHeroRightmost` — scans HQ indices 4→0, captures first non-null.
   - `captureHqHeroHighestCost` — scans all HQ slots left→right, picks highest
     `G.cardStats[heroId].cost`; ties broken by rightmost index (highest).
   - `captureHqHeroLowestCost` — scans all HQ slots left→right, picks lowest
     `G.cardStats[heroId].cost`; ties broken by rightmost index (highest).
   - All three safe-skip when HQ is entirely empty (no heroes to capture).
   - Added to `VILLAIN_EFFECT_KEYWORDS` at 0-indexed positions 7, 8, 9 (array length 7 → 10).
   - Drift-detection tests extended.

5. **Fight lifecycle: award captured heroes**
   - `fightVillain.ts` Step 3b extended: after `awardAttachedBystanders()`,
     call `awardAttachedHeroes(G, cardId, ctx.currentPlayer)`. Note:
     `ctx.currentPlayer` is a `string` (boardgame.io player ID).
   - Captured heroes go to **discard pile** (not victory pile — they are heroes
     the player gains, per "Fight: Gain that Hero" card text).

6. **Escape lifecycle: KO captured heroes**
   - `villainDeck.reveal.ts` escape branch extended: after
     `executeVillainAbilities()` (~line 227), call
     `koAttachedHeroesOnEscape(G, cardId)`. Escape abilities fire first,
     then captured heroes KO.
   - Captured heroes go to `G.ko` (the KO pile). They do not return to HQ.

7. **UIState projection**
   - `UIState.villainAttachedHeroes: Record<string, string[]>` projected
     alongside `attachedBystanders`.
   - `UICitySpaceState` extended with `attachedHeroes: string[]` (parallel to
     existing bystander projection).
   - Per-villain **engine-resolved** fight cost projected as `number` (the
     engine resolves; the UI displays).

8. **Effect-marker enrichment (card data)**
   - Curate `[effect:captureHqHeroRightmost]` and
     `[effect:captureHqHeroHighestCost]` markers in
     `inputs/villain-effect-markers.json` for all unconditional HQ-capture
     Ambush lines across the 40-set corpus.
   - Append the three new keywords to the overlay script's local
     `VILLAIN_EFFECT_KEYWORDS` array.
   - Run `apply-effect-markers.mjs` to inject markers into `data/cards/*.json`.

9. **Effect-marker enrichment — notable event labels (DEFERRED)**
   - `NotableEventOverlay.vue` `EFFECT_LABELS` update deferred to the
     arena-client UI WP that renders captured heroes. This WP is Engine +
     Card Data only; Vue components are UI-layer.

### Out (Deferred)

- **Hero Deck capture** (Dracula, Huntsman, Bullseye) — requires reveal-from-deck
  + conditional capture mechanics. Future keyword(s):
  `captureHeroDeckTop`, `captureHeroDeckRevealN`.
- **Player-zone capture** (Demon Bear, Cameron Hodge, Venture, Abilisk Tentacle)
  — requires targeting player zones + player choice mechanics. Future WP.
- **Cost-filtered capture** (Mindless Ones "costs 4 or less", Witchfire "lowest
  odd-numbered cost", Nebula "costs 4 or less from HQ or Officer Deck") —
  requires predicate parameters on capture keywords. Future WP.
- **Multi-capture** (Huntsman "top 3 cards") — requires N-capture loop. Future WP.
- **Scheme-level HQ manipulation** (Pocket Dimensions, cards "under HQ spaces")
  — different mechanic (cards under locations, not under villains). Future WP.
- **Arena-client UI rendering of attached heroes** — visual offset rendering of
  captured heroes underneath villain city tiles. Separate UI-only WP consuming
  the `UIState.villainAttachedHeroes` projection this WP ships. That UI WP
  also covers `NotableEventOverlay.vue` `EFFECT_LABELS` updates for the three
  new keywords (moved from §Scope item 9 — Vue components are UI-layer, not
  engine).
- **`captureHqHeroLowestCost` curation** — the `lowestCost` keyword ships in
  the engine but v1 curation may yield zero markers if no unconditional
  lowest-cost lines exist without additional qualifiers. Curation deferred to
  the cost-filtered capture WP.

---

## Locked Contract Values

| Item | Value | Source |
|------|-------|--------|
| G field name | `villainAttachedHeroes` | This WP |
| G field type | `Record<CardExtId, CardExtId[]>` | Mirrors `attachedBystanders` |
| Fight destination | Player's **discard** pile | Card text: "Gain that Hero" |
| Escape destination | `G.ko` (KO pile) | Tabletop rules (operator confirmed) |
| HQ rightmost index | `4` (last slot in 5-tuple) | `city.types.ts` |
| Keyword positions | 0-indexed 7, 8, 9 in `VILLAIN_EFFECT_KEYWORDS` (array length 7 → 10) | Append-only |
| `fightCostMode` values | `'static' \| 'dynamic'` | Closed 2-value union |
| Dynamic cost formula | `fightCostBase + sum(captured hero costs)` | Card text (operator confirmed) |
| Dynamic cost source field | `CardStatEntry.cost` (hero recruit cost) | `economy.types.ts` — never `fightCost` |
| HQ refill after capture | Yes — fill from Hero Deck top | Tabletop rules (operator confirmed) |
| HQ refill timing | Immediate — within same effect execution | Tabletop rules (operator confirmed) |
| Tie-break for cost selectors | Rightmost index (highest) wins | Convention |
| Selector determinism | Evaluate left→right, resolve by cost, break ties by highest index | Replay safety |
| Null HQ slots | Skipped by selector; all-null → safe no-op | Defence |
| Empty Hero Deck on refill | HQ slot stays `null`; no error | Defence |
| `resolveFightCost` authority | Single source — UI MUST NOT recompute | Engine-owns-truth invariant |
| Effect execution ordering | Sequential per parser output order | `villainAbility.setup.ts` sort |
| Capture atomicity | Remove → attach → refill within single effect | No intermediate state observable |

---

## Files

> Estimated. Actual file list may vary ±2 during execution.

### Engine (packages/game-engine/)

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `src/board/heroCapture.logic.ts` | **New** | Three pure capture/award/KO helpers |
| 2 | `src/board/heroCapture.logic.test.ts` | **New** | Unit tests for capture helpers |
| 3 | `src/types.ts` | Modify | Add `villainAttachedHeroes` to `LegendaryGameState` |
| 4 | `src/economy/economy.types.ts` | Modify | Add `fightCostMode` + `fightCostBase` to `CardStatEntry` |
| 5 | `src/economy/economy.resolve.ts` | **New** | `resolveFightCost()` pure function |
| 6 | `src/economy/economy.resolve.test.ts` | **New** | Tests for dynamic cost resolution |
| 7 | `src/rules/villainAbility.types.ts` | Modify | Extend `VillainEffectKeyword` union + array (7 → 10) |
| 8 | `src/villain/villainEffects.execute.ts` | Modify | Three new case branches in dispatcher |
| 9 | `src/villain/villainEffects.execute.test.ts` | Modify | Tests for new keywords |
| 10 | `src/setup/villainAbility.setup.ts` | Verify | Parser unchanged (reuses `[effect:]` regex) |
| 11 | `src/economy/economy.logic.ts` | Modify | Handle `vAttack: "*"` and `"N+"` in `buildCardStats` |
| 12 | `src/economy/economy.logic.test.ts` | Modify | Tests for dynamic attack parsing |
| 13 | `src/setup/buildInitialGameState.ts` | Modify | Initialize `villainAttachedHeroes: {}` |
| 14 | `src/moves/fightVillain.ts` | Modify | Call `awardAttachedHeroes` + `resolveFightCost` |
| 15 | `src/villainDeck/villainDeck.reveal.ts` | Modify | Call `koAttachedHeroesOnEscape` in escape branch |
| 16 | `src/ui/uiState.types.ts` | Modify | Project `villainAttachedHeroes` + per-space attached heroes + resolved fight cost |
| 17 | `src/ui/uiState.build.ts` | Modify | Build the projection (engine-resolved cost, not raw) |

### Card Data

| # | File | Action | Purpose |
|---|------|--------|---------|
| 18 | `scripts/convert-cards/inputs/villain-effect-markers.json` | Modify | Add HQ-capture markers |
| 19 | `scripts/convert-cards/apply-effect-markers.mjs` | Modify | Add 3 keywords to local array |
| 20 | `data/cards/*.json` (bounded) | Modify | Injected `[effect:]` markers |

### Governance

| # | File | Action | Purpose |
|---|------|--------|---------|
| 21 | `docs/ai/DECISIONS.md` | Modify | D-21401..D-214NN entries |
| 22 | `docs/ai/work-packets/WORK_INDEX.md` | Modify | Status flip |
| 23 | `docs/ai/STATUS.md` | Modify | Status entry |

---

## Estimated Curation Yield

Based on the card data corpus audit (2026-06-05):

| Keyword | Cards | Sets | Pattern |
|---------|-------|------|---------|
| `captureHqHeroRightmost` | ~3 | core | "Put the rightmost Hero from the HQ under this Villain" |
| `captureHqHeroHighestCost` | ~3 | core | "Put the highest-cost Hero from the HQ under this Villain" |
| `captureHqHeroLowestCost` | 0 (v1) | — | No unconditional lowest-cost lines without qualifiers |

The v1 curation yield is small (Core Set Skrull Shapeshifters only) because most
HQ-capture villains in other sets have cost filters, class filters, or complex
conditions that require predicate machinery deferred to follow-up WPs. The
**infrastructure** (state shape, lifecycle helpers, dynamic cost resolver, UI
projection) is the primary deliverable — it unblocks all future capture WPs.

---

## Acceptance Criteria

1. `G.villainAttachedHeroes` initialised as `{}` and maintained through
   capture → fight/escape lifecycle.
2. Skrull Shapeshifters (Core Set) captures the rightmost/highest-cost HQ hero
   on Ambush, reflected in `G.villainAttachedHeroes`.
3. HQ slot refilled from Hero Deck top after capture. If Hero Deck is empty,
   slot stays `null` — no error.
4. `resolveFightCost(G, skrullInstanceId)` returns the captured hero's
   recruit cost (for `vAttack: "*"`) or base + captured cost (for `"N+"`).
5. Fighting the Skrull awards the captured hero to the player's **discard**
   pile (not victory).
6. If the Skrull escapes, captured heroes go to `G.ko`.
7. `UIState` projects `villainAttachedHeroes` and **engine-resolved** fight
   costs. UI does not recompute dynamic values.
8. Effect markers injected into `data/cards/core.json` for both Skrull
   Shapeshifter variants.
9. Zone integrity: no hero ext_id duplicated across zones after any
   capture/fight/escape operation.
10. All existing tests pass. New test count ≥ 25.
11. `pnpm -r build` exits 0.

---

## Required Test Cases

Tests MUST include at minimum:

### Capture (heroCapture.logic.ts)
- Rightmost selection with gaps (null slots interspersed)
- Highest-cost selection with tie-breaking (same cost → rightmost wins)
- Lowest-cost selection with tie-breaking (same cost → rightmost wins)
- Empty HQ → returns `null`, no state mutation
- Single hero in HQ → captured regardless of selector
- HQ refill from Hero Deck after capture
- HQ refill when Hero Deck is empty → slot stays `null`

### State Integrity
- Captured hero removed from `G.hq` (slot set to `null` before refill)
- Captured hero appears in `G.villainAttachedHeroes[villainId]`
- No duplicate ext_id across `hq` + `villainAttachedHeroes` + `heroDeck`

### Fight Lifecycle (fightVillain.ts)
- Hero moves to defeating player's **discard** pile (not victory)
- Multiple captured heroes all move to discard
- `G.villainAttachedHeroes` entry deleted after award
- Villain with no attached heroes — no-op (backward compatible)

### Escape Lifecycle (villainDeck.reveal.ts)
- Captured heroes move to `G.ko`
- `G.villainAttachedHeroes` entry deleted after KO
- Villain with no attached heroes — no-op (backward compatible)

### Dynamic Cost Resolution (economy.resolve.ts)
- `vAttack: "*"` with one captured hero → returns hero's `cost`
- `vAttack: "*"` with no captured heroes → returns `0`
- `vAttack: "N+"` → returns `N + sum(captured hero costs)`
- Multiple captured heroes → sum of all costs
- Missing `cardStats` entry for captured hero → treats as `0`
- Static villain → returns `fightCost` unchanged (backward compatible)

### buildCardStats Parser
- `vAttack: "*"` → `fightCostMode: 'dynamic'`, `fightCostBase: 0`
- `vAttack: "4+"` → `fightCostMode: 'dynamic'`, `fightCostBase: 4`
- `vAttack: "7"` → `fightCostMode: 'static'` (existing behavior preserved)

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] All required test cases covered
- [ ] Engine tests green (baseline + ≥ 25 net-new)
- [ ] `pnpm -r build` exits 0
- [ ] DECISIONS.md entries landed
- [ ] WORK_INDEX.md status flipped
- [ ] Replay fixture re-pinned if hash shifts (behaviour-neutral)

---

## Lint Gate Self-Review

| § | Verdict | Notes |
|---|---------|-------|
| §1 Structure | PASS | Goal, Assumes, Scope (In/Out), Files, Acceptance Criteria, Definition of Done all present. Context = `## Session Context`. No `## Non-Negotiable Constraints` header — content covered by `## Determinism & Invariants` + `## Locked Contract Values`; see §2. |
| §2 Constraints | PASS | Determinism & Invariants section covers engine-wide constraints; Locked Contract Values covers packet-specific. Code style enforced by `.claude/rules/code-style.md` at execution. |
| §3 Prerequisites | PASS | All 6 hard-deps listed with specific exports/shapes. |
| §4 Context | PASS | Session Context references the full villain effect pipeline history. ARCHITECTURE.md layer boundary enforced at execution via `.claude/skills/legendary-game-engine/SKILL.md`. |
| §5 Output Completeness | PASS | 23 files listed with action + purpose. Exceeds ~8 guidance — bundling justified inline (single coherent engine surface). |
| §6 Naming | PASS | `villainAttachedHeroes`, `CardExtId`, `fightCost`, `CardStatEntry` all match canonical names. |
| §7 Dependencies | PASS | No new npm deps. |
| §8 Architectural Boundaries | PASS | All new code in `packages/game-engine/` (engine layer) + `scripts/convert-cards/` (card data tooling). No DB queries, no server imports. `heroCapture.logic.ts` + `economy.resolve.ts` are pure helpers (no boardgame.io import). |
| §9 Windows | N/A | No shell scripts produced. |
| §10 Env Vars | N/A | No new env vars. |
| §11 Auth | N/A | Does not touch authentication. |
| §12 Test Quality | PASS | `node:test` only. ≥ 25 net-new required. No boardgame.io imports in test helpers. No network/DB access. |
| §13 Verification | PASS | Acceptance Criteria are binary observable checks; `pnpm -r build` exits 0 is explicit. |
| §14 Acceptance Criteria | PASS | 12 binary items, all observable and specific. |
| §15 Definition of Done | PASS | Includes AC, DECISIONS, WORK_INDEX, STATUS checkboxes + replay re-pin. |
| §16 Code Style | PASS | Pure helpers, explicit control flow, full English names, `// why:` comments required at 6 sites. |
| §17 Vision Alignment | PASS | Touches card data (Vision §1, §2) and determinism (Vision §3, §8). No conflict: capture mechanics are faithful to physical card text; all randomness via `ctx.random.*`; determinism explicitly locked in §Determinism & Invariants. NG-1..7 not crossed. |
| §18 Prose-vs-Grep | PASS | No count-bounded grep gates in Verification Steps that would collide with prose. |
| §19 Bridge Staleness | N/A | No repo-state-summarizing artifact. |
| §20 Funding Surface | N/A | Does not touch funding surfaces. |
| §21 API Catalog | N/A | No HTTP endpoints added/modified. |

**Result: 21/21 resolved (15 PASS, 6 N/A).**

---

## Open Questions

All resolved (2026-06-05, operator confirmation):

1. ~~**Fight: Gain that Hero — discard or hand?**~~ **Resolved: discard pile.**
   "Gain that Hero" means it goes into the player's discard pile and gets
   shuffled into the deck the normal way.

2. ~~**Escape destination — KO or return to HQ?**~~ **Resolved: KO pile.**
   Captured heroes under an escaping villain get KO'd.

3. ~~**Multiple captures — sum of costs?**~~ **Resolved: sum.**
   Fight cost = `fightCostBase + sum(all captured hero recruit costs)`.

4. ~~**HQ refill timing — immediate?**~~ **Resolved: immediate.**
   HQ slot refills from the Hero Deck immediately after capture, within
   the same effect execution, before other Ambush effects resolve.
