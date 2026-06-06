# WP-219 — Hero Reveal Cost-Attack + Odd-Draw Executors (Engine + Data)

**Status:** Draft
**Primary Layer:** Game Engine + Card Data + Offline Tooling
**Dependencies:** WP-218 (reveal-ko-or-draw executor + D-21801..D-21803 active)

---

## Session Context

> WP-218 shipped `reveal-ko-or-draw` and fixed the `reveal-ko` zone-integrity bug,
> bringing the compound executor family to 4 keywords (`reveal`, `reveal-ko`,
> `reveal-min`, `reveal-ko-or-draw`). Corpus scan during the WP-218 session identified
> two additional clean, unconditional reveal patterns with one hero card each:
>
> 1. **Cost-grant attack:** `core/gambit/high-stakes-jackpot` — "Reveal the top card
>    of your deck. You get +[icon:attack] equal to its cost." The card stays on the deck
>    (no zone mutation). Attack granted = `G.cardStats[topCardId].cost`. No magnitude.
>
> 2. **Odd-cost draw:** `msis/wanda-vision/witchcraft` — "Reveal the top card of your
>    deck. If its cost is odd, draw it." Card drawn via `moveCardFromZone` when
>    `cardStats.cost % 2 !== 0`; no-op when even (0 is even). No magnitude.
>
> Three deferred patterns found during corpus scan are documented in D-21903:
> - `2099/ravage-2099/overhorns-and-underhorns`: attack + "Discard it or put it back"
>   (player choice — not in executor scope)
> - `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner`: KO + attack compound
>   (multi-branch; deferred)
> - Villain odd-draw (Poison Scarlet Witch): villain pipeline, not hero executor scope

---

## Goal

After this packet:

- A new `reveal-cost-attack` executor handles "reveal top; grant attack equal to cost"
  ability lines. The top card stays on the deck.
- A new `reveal-odd-draw` executor handles "reveal top; draw if cost is odd" ability
  lines, using the established `moveCardFromZone` draw pattern.
- Two hero cards are marked: `core/gambit/high-stakes-jackpot` and
  `msis/wanda-vision/witchcraft`.
- D-21903 documents the three deferred discard/put-back/KO+attack patterns.

---

## Assumes

- WP-218 shipped: `reveal-ko-or-draw` keyword + executor, `HERO_KEYWORDS` count = 11,
  tests = 1133. Commit `9c9215b` on `origin/main`.
- `G.turnEconomy.attack` is the attack economy field mutated by the existing `'attack'`
  executor case. `reveal-cost-attack` uses the same mutation: `G.turnEconomy.attack += cardStats.cost`.
- `G.turnEconomy` may be undefined if not initialized; guard with `if (!G.turnEconomy) { break; }`.
- `G.cardStats[topCardId].cost` is 0 for free cards. `0 % 2 === 0` — cost-0 cards are
  **even** and are NOT drawn by `reveal-odd-draw`.
- `reveal-cost-attack` does NOT mutate any zone. The top card remains at `deck[0]`
  after the executor fires.
- `reveal-odd-draw` draw path: `moveCardFromZone(playerZones.deck, playerZones.hand, topCardId)`
  then assign `playerZones.deck = moveResult.from; playerZones.hand = moveResult.to`.
  Guarded by `moveResult.found`.
- Both keywords have no magnitude — `VALID_TOKEN_PATTERN` accepts the no-suffix forms.
- `KEYWORD_PATTERN` already allows hyphens (extended in WP-217): no regex change needed.

---

## Context (Read First)

1. `packages/game-engine/src/hero/heroEffects.execute.ts` — `'attack'` case (canonical
   `G.turnEconomy.attack += effect.magnitude` pattern); `reveal-ko-or-draw` case (draw
   sub-path via `moveCardFromZone`); `reveal-min` case (magnitude-gated draw sub-path);
   `MVP_KEYWORDS` Set; pre-check magnitude gate (`if (keyword !== 'rescue' && keyword !== 'reveal-ko' && ...)`)
2. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — tests 29–36
   (reveal-ko-or-draw, 8 cases — reference for test naming and assertion style)
3. `packages/game-engine/src/rules/heroKeywords.ts` — `HeroKeyword` union,
   `HERO_KEYWORDS` array (currently 11 entries)
4. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection test
   (currently expects exactly 11 keywords; update to 13)
5. `scripts/convert-cards/apply-hero-ability-markers.mjs` — `VALID_TOKEN_PATTERN`
   (must be extended for two new no-suffix forms); `collectProposeRowsForSet`
   (add two new candidate-routing branches)
6. `scripts/convert-cards/inputs/hero-ability-markers.json` — curated map (2 new entries)
7. `data/cards/core.json` — gambit/high-stakes-jackpot abilityIndex=0
8. `data/cards/msis.json` — wanda-vision/witchcraft abilityIndex=0
9. `docs/ai/DECISIONS.md` — D-21901..D-21903 (draft in this session)
10. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code constraints

---

## Scope (In)

### Engine — New Keywords and Executors

1. **Add `'reveal-cost-attack'` and `'reveal-odd-draw'` to `HeroKeyword`** union and
   `HERO_KEYWORDS` canonical array in `heroKeywords.ts`. Add each with a `// why: D-21901`
   and `// why: D-21902` citation respectively. Position after `'reveal-ko-or-draw'`
   (before `'conditional'`). Count becomes 13.

2. **Add both keywords to `MVP_KEYWORDS`** Set in `heroEffects.execute.ts`.

3. **Add both keywords to the pre-check magnitude gate exclusion list** in
   `heroEffects.execute.ts`. The existing gate skips magnitude checks for keywords
   that either have no magnitude or use internal magnitude (like `rescue`, `reveal-ko`).
   Both new keywords have no magnitude at all — exclude them from the magnitude gate.

4. **Add `'reveal-cost-attack'` executor branch** in `executeSingleEffect()`, after
   the `reveal-ko-or-draw` case:

   ```typescript
   case 'reveal-cost-attack': {
     // why: reveal-cost-attack peeks deck top; grants attack equal to its cost;
     // card stays on deck (no zone mutation) (D-21901)
     const playerZones = G.playerZones[playerID];
     if (!playerZones) { break; }
     if (playerZones.deck.length === 0) { break; }
     const topCardId = playerZones.deck[0];
     if (!topCardId) { break; }
     const cardStats = G.cardStats[topCardId];
     if (cardStats === undefined) { break; }
     if (!G.turnEconomy) { break; }
     G.turnEconomy.attack += cardStats.cost;
     break;
   }
   ```

   **No zone mutation.** The card stays at `deck[0]`. Only `G.turnEconomy.attack`
   is mutated. A cost-0 card grants 0 attack (no-op to economy but still valid).

5. **Add `'reveal-odd-draw'` executor branch**, after `reveal-cost-attack`:

   ```typescript
   case 'reveal-odd-draw': {
     // why: reveal-odd-draw peeks deck top; draws it when cost is odd (cost % 2 !== 0);
     // cost-0 is even and does NOT trigger the draw (D-21902)
     const playerZones = G.playerZones[playerID];
     if (!playerZones) { break; }
     if (playerZones.deck.length === 0) { break; }
     const topCardId = playerZones.deck[0];
     if (!topCardId) { break; }
     const cardStats = G.cardStats[topCardId];
     if (cardStats === undefined) { break; }
     if (cardStats.cost % 2 !== 0) {
       const moveResult = moveCardFromZone(playerZones.deck, playerZones.hand, topCardId);
       if (moveResult.found) {
         playerZones.deck = moveResult.from;
         playerZones.hand = moveResult.to;
       }
     }
     // cost is even (including 0): no-op
     break;
   }
   ```

6. **Tests** for both new executors in `heroEffects.execute.test.ts`:

   For `reveal-cost-attack` (5 new cases):
   - cost-3 top card → `G.turnEconomy.attack` increased by 3; card stays on deck; deck unchanged
   - cost-0 top card → `G.turnEconomy.attack` increased by 0 (no-op to economy); card stays on deck
   - empty deck → no-op; turnEconomy unchanged
   - cardStats missing → no-op; turnEconomy unchanged
   - `G.turnEconomy` undefined → no-op (guard fires)

   For `reveal-odd-draw` (6 new cases):
   - cost-1 top card → drawn; `deck.length` decreases by 1; `hand.length` increases by 1
   - cost-3 top card → drawn (confirm odd ≥ 3 works)
   - cost-0 top card → no-op (0 is even); deck unchanged; hand unchanged
   - cost-2 top card → no-op (2 is even); deck unchanged
   - empty deck → no-op; hand unchanged
   - cardStats missing → no-op; hand unchanged

   Total new test cases: 11.

### Tooling — `apply-hero-ability-markers.mjs`

7. **Extend `VALID_TOKEN_PATTERN`** to accept the two new no-suffix forms:

   ```
   /^\[keyword:rescue:\d+\]$
    |^\[keyword:reveal\]$
    |^\[keyword:reveal:\d+\]$
    |^\[keyword:reveal-ko\]$
    |^\[keyword:reveal-min:\d+\]$
    |^\[keyword:reveal-ko-or-draw:\d+\]$
    |^\[keyword:reveal-cost-attack\]$
    |^\[keyword:reveal-odd-draw\]$/
   ```

8. **Add `isRevealCostAttackCandidate(line)`** detection function:
   A line qualifies IFF ALL of the following are true:
   - Contains `[icon:attack]` AND a phrase like `equal to its cost` (capture: `/equal to its cost/i` AND `/\[icon:attack\]/`)
   - Does NOT contain `'Villain Deck'` or `'Master Strike'`
   - Does NOT contain `'Otherwise'`
   - Does NOT contain `'[keyword:reveal'` (already marked)

9. **Add `isRevealOddDrawCandidate(line)`** detection function:
   A line qualifies IFF ALL of the following are true:
   - `/cost is odd.*draw it/i` matches
   - Does NOT contain `'Villain Deck'` or `'Master Strike'`
   - Does NOT contain `'Otherwise'`
   - Does NOT contain `'[keyword:reveal'` (already marked)

10. **Update `collectProposeRowsForSet()`**: add routing for both new candidate
    functions. Evaluate compound-KO-or-draw first (already there), then
    `isRevealCostAttackCandidate`, then `isRevealOddDrawCandidate`, then existing
    plain-KO / reveal-min / reveal candidates in the established order.

### Data — `hero-ability-markers.json` and `data/cards/*.json`

11. **Add 2 new entries** to `hero-ability-markers.json`:

    ```json
    "core": [
      ...(existing entries)...,
      { "heroSlug": "gambit", "cardSlug": "high-stakes-jackpot",
        "abilityIndex": 0, "markupToken": "[keyword:reveal-cost-attack]" }
    ],
    "msis": [
      { "heroSlug": "wanda-vision", "cardSlug": "witchcraft",
        "abilityIndex": 0, "markupToken": "[keyword:reveal-odd-draw]" }
    ]
    ```

    Run `--propose` BEFORE editing the map to confirm slugs and indices.

12. **Apply markup** with `node scripts/convert-cards/apply-hero-ability-markers.mjs`.
    `Updated` count must be 2 on first run. Second run must produce zero diff
    (idempotence). `--validate` must exit 0.

---

## Out of Scope

- `2099/ravage-2099/overhorns-and-underhorns`: "Reveal the top card of your deck. If
  it costs 4 or less, you get +[icon:attack] equal to its cost. Discard it or put it
  back." — requires player choice (discard vs put-back); not in executor scope. D-21903.
- `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner`: compound KO + attack on a
  single reveal line — multi-branch pattern; deferred.
- `vnom/venomized-dr-strange/see-future-timelines`: discard + attack; deferred.
- Villain odd-draw (Poison Scarlet Witch): villain pipeline, not hero executor. Deferred.
- Class/team/icon condition reveals: "If it's a [team:x-men] Hero…" — deferred.
- Magnitude variants of `reveal-cost-attack` or `reveal-odd-draw` — not in corpus; deferred.
- Dedicated `removeFromZone` helper — deferred until ≥ 3 call sites.
- Any engine changes beyond `heroKeywords.ts` and `heroEffects.execute.ts`.
- Any registry, server, or client changes.

---

## Files Expected to Change

**Engine (modified):**
1. `packages/game-engine/src/rules/heroKeywords.ts` — add `'reveal-cost-attack'`, `'reveal-odd-draw'`
2. `packages/game-engine/src/hero/heroEffects.execute.ts` — add both keywords to `MVP_KEYWORDS` + magnitude-gate exclusion + two executor cases

**Engine tests (modified):**
3. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — 11 new test cases
4. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection test 11 → 13

**Tooling (modified):**
5. `scripts/convert-cards/apply-hero-ability-markers.mjs` — extend `VALID_TOKEN_PATTERN`; add `isRevealCostAttackCandidate`, `isRevealOddDrawCandidate`; update `collectProposeRowsForSet` routing

**Data (modified):**
6. `scripts/convert-cards/inputs/hero-ability-markers.json` — 2 new entries
7. `data/cards/core.json` — gambit/high-stakes-jackpot abilityIndex=0 markup
8. `data/cards/msis.json` — wanda-vision/witchcraft abilityIndex=0 markup

**Governance:**
9. `docs/ai/DECISIONS.md` — D-21901..D-21903
10. `docs/ai/STATUS.md` — WP-219 executed
11. `docs/ai/work-packets/WORK_INDEX.md` — WP-219 `[ ]` → `[x]`
12. `docs/ai/execution-checklists/EC_INDEX.md` — EC-251 Draft → Done

---

## Contract

### New Keyword `reveal-cost-attack` (D-21901)

| Token | Executor | Semantics |
|---|---|---|
| `[keyword:reveal-cost-attack]` | `reveal-cost-attack` | Peek deck top; `G.turnEconomy.attack += cardStats.cost`; card stays on deck |

**No zone mutation.** `deck[0]` is unchanged after the executor fires.
A cost-0 card grants 0 attack — valid (not a no-op of the executor itself, just
a zero-magnitude grant).

**Guards (all `break` on failure):** `playerZones` exists; `deck.length > 0`;
`deck[0]` truthy; `G.cardStats[topCardId]` exists; `G.turnEconomy` exists.

### New Keyword `reveal-odd-draw` (D-21902)

| Token | Executor | Semantics |
|---|---|---|
| `[keyword:reveal-odd-draw]` | `reveal-odd-draw` | Peek deck top; draw if `cost % 2 !== 0`; no-op if even (including cost = 0) |

**Odd/even definition:** standard mathematical — `0 % 2 === 0` (even); `1 % 2 !== 0`
(odd). Cost-0 cards are even and are NOT drawn.

**Mutation guarantees:**
- Odd branch: `deck.length` decreases by 1; `hand.length` increases by 1
- Even branch (including cost = 0): no mutation

**Draw path:** `moveCardFromZone(deck, hand, topCardId)`; assign `deck = moveResult.from;
hand = moveResult.to` when `moveResult.found === true`.

### Detection Function Notes

`isRevealCostAttackCandidate` uses two positive anchors: `[icon:attack]` AND
`equal to its cost`. `isRevealOddDrawCandidate` uses `/cost is odd.*draw it/i`.
Both are narrow enough to be corpus-safe without requiring mutual-exclusivity logic
(the two patterns are structurally distinct; no line in the corpus matches both).

---

## Decisions to Reserve

- **D-21901** — New HeroKeyword `reveal-cost-attack`: executor peeks deck top, grants
  `G.turnEconomy.attack += cardStats.cost`, card stays on deck. No zone mutation.
  No magnitude. In-scope card: `core/gambit/high-stakes-jackpot`.
- **D-21902** — New HeroKeyword `reveal-odd-draw`: executor peeks deck top, draws the
  card via `moveCardFromZone` when `cost % 2 !== 0`. Cost-0 is even and does not draw.
  No magnitude. In-scope card: `msis/wanda-vision/witchcraft`.
- **D-21903** — Deferred discard/put-back reveal pattern: `2099/ravage-2099/overhorns-and-underhorns`
  has "Reveal the top card of your deck. If it costs 4 or less, you get +[icon:attack]
  equal to its cost. Discard it or put it back." The trailing "Discard it or put it back."
  is a player-choice branch not expressible in the current single-effect executor model.
  Deferred pending player-choice executor infrastructure. Also defers
  `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner` (KO+attack compound) and
  villain odd-draw (wrong pipeline).

---

## Acceptance Criteria

1. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no new failures.
2. `pnpm -r build` exits 0.
3. `HERO_KEYWORDS` canonical array and `HeroKeyword` union both contain
   `'reveal-cost-attack'` and `'reveal-odd-draw'`; drift-detection test passes (13 keywords).
4. `reveal-cost-attack` on cost-3 top card: `G.turnEconomy.attack` increases by 3;
   `deck.length` unchanged; card still at `deck[0]`.
5. `reveal-cost-attack` on cost-0 top card: `G.turnEconomy.attack` increases by 0;
   deck unchanged.
6. `reveal-cost-attack` with empty deck: no-op; `G.turnEconomy` unchanged.
7. `reveal-cost-attack` with missing cardStats: no-op.
8. `reveal-cost-attack` with `G.turnEconomy` undefined: no-op.
9. `reveal-odd-draw` on cost-1 top card: drawn; `deck.length` decreases by 1;
   `hand.length` increases by 1.
10. `reveal-odd-draw` on cost-3 top card: drawn.
11. `reveal-odd-draw` on cost-0 top card: no-op; deck unchanged; hand unchanged.
12. `reveal-odd-draw` on cost-2 top card: no-op (even cost).
13. `reveal-odd-draw` with empty deck: no-op.
14. `reveal-odd-draw` with missing cardStats: no-op.
15. `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "reveal-cost-attack\|reveal-odd-draw"` includes exactly 2 rows.
16. `node scripts/convert-cards/apply-hero-ability-markers.mjs` reports `Updated: 2` on first run.
17. Second apply run: `git diff data/cards/` empty (idempotence).
18. `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0.
19. `grep "\[keyword:reveal-cost-attack\]" data/cards/core.json | wc -l` = 1.
20. `grep "\[keyword:reveal-odd-draw\]" data/cards/msis.json | wc -l` = 1.
21. `assertValidToken` rejects `[keyword:reveal-cost-attack:2]` (spurious suffix) with
    non-zero exit and a full-sentence error message.
22. No files outside `## Files Expected to Change` were modified.
23. `DECISIONS.md` D-21901..D-21903 Active.

---

## Verification Steps

```bash
# Baseline
pnpm --filter @legendary-arena/game-engine test
# Expected: 1133 pass (WP-218 baseline; record for comparison)

git diff --name-only data/cards/ packages/game-engine/
# Expected: empty

# Confirm gambit/wanda-vision not yet marked
grep "reveal-cost-attack\|reveal-odd-draw" data/cards/core.json data/cards/msis.json
# Expected: empty

# After engine changes:
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; test count ≥ 1144 (1133 + 11 new cases)

# After tooling changes:
node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "reveal-cost-attack\|reveal-odd-draw"
# Expected: 2 rows — gambit (reveal-cost-attack) and wanda-vision (reveal-odd-draw)

# Apply
node scripts/convert-cards/apply-hero-ability-markers.mjs
# Expected: Updated: 2

# Idempotence
node scripts/convert-cards/apply-hero-ability-markers.mjs
git diff data/cards/
# Expected: no output

# Validate
node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
# Expected: exits 0

# Token counts
grep "\[keyword:reveal-cost-attack\]" data/cards/core.json | wc -l    # Expected: 1
grep "\[keyword:reveal-odd-draw\]" data/cards/msis.json | wc -l       # Expected: 1

# Build
pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria above are met.
- [ ] `'reveal-cost-attack'` and `'reveal-odd-draw'` in `HeroKeyword` union + `HERO_KEYWORDS` array.
- [ ] Both executor cases in `heroEffects.execute.ts` with `// why: D-21901` and `// why: D-21902`.
- [ ] `reveal-cost-attack`: no zone mutation; only `G.turnEconomy.attack` mutated; `G.turnEconomy` guard present.
- [ ] `reveal-odd-draw`: `cost % 2 !== 0` condition; cost-0 is even (no-op confirmed by test).
- [ ] Drift-detection test updated to 13 keywords.
- [ ] 11 new test cases covering cost-3 attack grant, cost-0 attack grant, odd draw, even/zero no-op, empty deck, missing stats, undefined turnEconomy.
- [ ] `VALID_TOKEN_PATTERN` accepts `[keyword:reveal-cost-attack]` and `[keyword:reveal-odd-draw]`.
- [ ] `isRevealCostAttackCandidate` and `isRevealOddDrawCandidate` added.
- [ ] `hero-ability-markers.json` has 2 new entries.
- [ ] `data/cards/core.json` and `data/cards/msis.json` marked.
- [ ] `docs/ai/DECISIONS.md` D-21901..D-21903 Active.
- [ ] `docs/ai/STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md` updated.
- [ ] No files outside §Files Expected to Change were modified.
