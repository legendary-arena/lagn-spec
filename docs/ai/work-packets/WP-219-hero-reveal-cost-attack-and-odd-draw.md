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
- When `G.turnEconomy` exists, `G.turnEconomy.attack` is already initialized to a
  numeric value by setup/turn-start logic — `reveal-cost-attack` does not need to
  initialize it. If that guarantee does not already hold, this WP must not silently
  invent it; stop and confirm first.
- `G.cardStats[topCardId].cost` is 0 for free cards. `0 % 2 === 0` — cost-0 cards are
  **even** and are NOT drawn by `reveal-odd-draw`.
- `reveal-cost-attack` does NOT mutate any zone. After execution, `playerZones.deck[0]`
  MUST still equal the same `topCardId` read before evaluation.
- `reveal-odd-draw` draw path: `moveCardFromZone(playerZones.deck, playerZones.hand, topCardId)`
  then assign `playerZones.deck = moveResult.from; playerZones.hand = moveResult.to`.
  Guarded by `moveResult.found`.
- Both keywords have no magnitude — `VALID_TOKEN_PATTERN` accepts the no-suffix forms.
- `KEYWORD_PATTERN` already allows hyphens (extended in WP-217): no regex change needed.
- The `NO_MAGNITUDE_KEYWORDS` set (or equivalent helper predicate) exists in
  `heroEffects.execute.ts` by the time this WP executes; if it does not yet exist as
  a named entity, this WP creates it by extracting the current chained exclusions into
  the set before adding the two new keywords.

---

## Non-Negotiable Constraints

### Engine
- No `.reduce()` in zone operations or effect application — use `for` / `for...of` loops.
- Zone mutations MUST go through `zoneOps.ts` helpers (`moveCardFromZone`).
- `reveal-cost-attack` MUST NOT mutate any zone — only `G.turnEconomy.attack` is written.
- `HERO_KEYWORDS` canonical array and `HeroKeyword` union must stay in parity at all times.
  Drift-detection test must pass at exactly 13 after this packet.
- `NO_MAGNITUDE_KEYWORDS` is the sole gate for magnitude-exempt forms — no ad hoc chained
  `keyword !== X` conditions for this gate.
- Both executors emit silent no-ops on empty deck, missing stats, or missing turnEconomy.
  No throw. No log.
- All `ctx.events.setPhase()` and `ctx.events.endTurn()` calls require a `// why:` comment
  (none introduced by this packet; carried as standing rule).

### Tooling
- ESM-only, Node v22+ — no `require()`, no `node-fetch`.
- No `@legendary-arena/*` imports in `scripts/convert-cards/`. Offline Shared Tooling only.
- All detection functions MUST require the reveal anchor `/Reveal the top card of your deck\./i`
  as a positive match condition.
- All detection functions MUST use regex-based, case-insensitive matching.
- `assertValidToken()` must reject `[keyword:reveal-cost-attack:2]` and `[keyword:reveal-odd-draw:1]`.

### Data
- Only surgical token appends — no structural JSON changes to `data/cards/*.json`.
- Run `--propose` before editing `hero-ability-markers.json` — never skip.
- `hero-ability-markers.json` entries added to existing set arrays (do not replace or
  restructure).

### Locked Contract Values (do not re-derive at execution time; read EC-251 instead)
- Odd check: `cardStats.cost % 2 !== 0` — never `=== 1`
- Odd-draw move assignment: `playerZones.deck = moveResult.from; playerZones.hand = moveResult.to`
  when `moveResult.found === true`
- Attack mutation: `G.turnEconomy.attack += cardStats.cost` — no zone mutation

---

## Context (Read First)

1. `packages/game-engine/src/hero/heroEffects.execute.ts` — `'attack'` case (canonical
   `G.turnEconomy.attack += effect.magnitude` pattern); `reveal-ko-or-draw` case (draw
   sub-path via `moveCardFromZone`); `reveal-min` case (magnitude-gated draw sub-path);
   `MVP_KEYWORDS` Set; pre-check magnitude gate — look for the `NO_MAGNITUDE_KEYWORDS`
   set or its current equivalent chained exclusion (`rescue`, `reveal-ko`, …); `'ko'`
   case (canonical `moveCardFromZone` + `koCard` coupling)
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
11. `docs/ai/ARCHITECTURE.md` — Layer Boundary; engine vs Shared Tooling; `G` is runtime-only

---

## Scope (In)

### Engine — New Keywords and Executors

1. **Add `'reveal-cost-attack'` and `'reveal-odd-draw'` to `HeroKeyword`** union and
   `HERO_KEYWORDS` canonical array in `heroKeywords.ts`. Add each with a `// why: D-21901`
   and `// why: D-21902` citation respectively. Position after `'reveal-ko-or-draw'`
   (before `'conditional'`). Count becomes 13.

2. **Add both keywords to `MVP_KEYWORDS`** Set in `heroEffects.execute.ts`.

3. **Add both keywords to `NO_MAGNITUDE_KEYWORDS`** in `heroEffects.execute.ts`.

   The reveal keyword family now contains multiple no-magnitude forms (`rescue`,
   `reveal-ko`, `reveal-ko-or-draw`, and now both new keywords). If the pre-check
   gate is currently implemented as an ad hoc chained `keyword !== 'rescue' && ...`
   condition, extract it into a named `NO_MAGNITUDE_KEYWORDS` Set before adding
   the two new keywords. This turns a drift-prone boolean chain into a stable,
   auditable contract surface.

   ```typescript
   // why: these keywords have no external magnitude; the pre-check gate must not
   // reject them for missing magnitude — they use internal cost or parity logic
   const NO_MAGNITUDE_KEYWORDS = new Set<HeroKeyword>([
     'rescue', 'reveal-ko', 'reveal-ko-or-draw', 'reveal-cost-attack', 'reveal-odd-draw',
   ]);
   ```

   The pre-check gate then reads:
   ```typescript
   if (!NO_MAGNITUDE_KEYWORDS.has(keyword) && !isValidMagnitude(effect.magnitude)) {
     return;
   }
   ```

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
   is mutated. A cost-0 card grants 0 attack (valid; not a no-op of the executor
   itself — the economy is touched even if by zero).

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
   - cost-3 top card → `G.turnEconomy.attack` increased by 3; `deck.length` unchanged;
     same `topCardId` still at `deck[0]` (identity preserved)
   - cost-0 top card → `G.turnEconomy.attack` increased by 0; deck unchanged
   - empty deck → no-op; `G.turnEconomy.attack` unchanged
   - cardStats missing → no-op; `G.turnEconomy.attack` unchanged
   - `G.turnEconomy` undefined → no-op (guard fires)

   For `reveal-odd-draw` (6 new cases):
   - cost-1 top card → drawn; `deck.length` decreases by 1; `hand.length` increases by 1;
     the exact `topCardId` is now in `hand` (not a different card)
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

   Note: no `:\d+` branch for the two new forms. `assertValidToken` MUST reject
   `[keyword:reveal-cost-attack:2]` and `[keyword:reveal-odd-draw:1]`.

8. **Add `isRevealCostAttackCandidate(line)`** detection function.
   All detection functions MUST use regex-based, case-insensitive matching and
   tolerate harmless whitespace variance.

   A line qualifies IFF ALL of the following are true:
   - `/Reveal the top card of your deck\./i` matches (reveal anchor — required)
   - `/\[icon:attack\]/` matches
   - `/equal to its cost/i` matches
   - Does NOT contain `'Villain Deck'` or `'Master Strike'`
   - Does NOT contain `'Otherwise'`
   - Does NOT contain `'[keyword:reveal-cost-attack]'` (idempotence guard)

9. **Add `isRevealOddDrawCandidate(line)`** detection function.
   Same regex discipline applies.

   A line qualifies IFF ALL of the following are true:
   - `/Reveal the top card of your deck\./i` matches (reveal anchor — required)
   - `/cost is odd/i` matches
   - `/draw it/i` matches
   - Does NOT contain `'Villain Deck'` or `'Master Strike'`
   - Does NOT contain `'Otherwise'`
   - Does NOT contain `'[keyword:reveal-odd-draw]'` (idempotence guard)

10. **Update `collectProposeRowsForSet()`**: add routing for both new candidate
    functions. The routing order is authoritative — it ensures deterministic
    first-match behavior as the reveal family grows:

    1. `isRevealKoOrDrawCandidate` (compound — already first)
    2. `isRevealCostAttackCandidate` (new)
    3. `isRevealOddDrawCandidate` (new)
    4. `isRevealKoCandidate`
    5. `isRevealMinCandidate`
    6. `isRevealCandidate`

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
    Verify the propose output includes the exact rows for gambit and wanda-vision
    before committing the curated map entries.

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
2. `packages/game-engine/src/hero/heroEffects.execute.ts` — add both keywords to `MVP_KEYWORDS` + `NO_MAGNITUDE_KEYWORDS` + two executor cases

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

**No zone mutation (strict).**
- `playerZones.deck` MUST remain the same array length after execution.
- The exact revealed `topCardId` MUST remain at `playerZones.deck[0]`.
- No deck reorder, remove, or reinsert operation is allowed.
- Only `G.turnEconomy.attack` is mutated.

A cost-0 card grants 0 attack — valid. The executor fires; economy is touched even if by zero.

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

**Odd branch identity guarantee:**
- The exact revealed `topCardId` MUST be the card moved to hand.
- The card removed from `playerZones.deck[0]` and the card appended to
  `playerZones.hand` MUST be the same ID.

### No-Magnitude Keyword Contract

`NO_MAGNITUDE_KEYWORDS` is a named Set in `heroEffects.execute.ts` containing all
HeroKeywords that intentionally skip the pre-check magnitude gate:

```
{ 'rescue', 'reveal-ko', 'reveal-ko-or-draw', 'reveal-cost-attack', 'reveal-odd-draw' }
```

Future no-magnitude keywords MUST be added to this set. Ad hoc chained `keyword !== X`
conditions are forbidden for this gate.

### Detection Function Contract

All candidate detection functions MUST:
- Use regex-based, case-insensitive matching.
- Require the reveal anchor: `/Reveal the top card of your deck\./i`.
- Tolerate harmless punctuation/whitespace variance.
- Include an idempotence guard (`Does NOT contain '[keyword:X]'`) for their own token.

`collectProposeRowsForSet()` routing order is authoritative for deterministic
first-match behavior. Order is: compound-KO-or-draw → cost-attack → odd-draw →
plain-KO → reveal-min → reveal.

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
   `deck.length` unchanged; same `topCardId` still at `deck[0]`.
5. `reveal-cost-attack` on cost-0 top card: `G.turnEconomy.attack` increases by 0;
   deck unchanged.
6. `reveal-cost-attack` with empty deck: no-op; `G.turnEconomy.attack` unchanged.
7. `reveal-cost-attack` with missing cardStats: no-op.
8. `reveal-cost-attack` with `G.turnEconomy` undefined: no-op.
9. `reveal-odd-draw` on cost-1 top card: drawn; `deck.length` decreases by 1;
   `hand.length` increases by 1.
10. `reveal-odd-draw` on cost-3 top card: drawn.
11. `reveal-odd-draw` on cost-0 top card: no-op; deck unchanged; hand unchanged.
12. `reveal-odd-draw` on cost-2 top card: no-op (even cost).
13. `reveal-odd-draw` with empty deck: no-op.
14. `reveal-odd-draw` with missing cardStats: no-op.
15. `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose` output includes:
    - a row for `core | gambit | high-stakes-jackpot | abilityIndex=0 | … | suggested=[keyword:reveal-cost-attack]`
    - a row for `msis | wanda-vision | witchcraft | abilityIndex=0 | … | suggested=[keyword:reveal-odd-draw]`
16. `node scripts/convert-cards/apply-hero-ability-markers.mjs` reports `Updated: 2` on first run.
17. Second apply run: `git diff data/cards/` empty (idempotence).
18. `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0.
19. `grep "\[keyword:reveal-cost-attack\]" data/cards/core.json | wc -l` = 1.
20. `grep "\[keyword:reveal-odd-draw\]" data/cards/msis.json | wc -l` = 1.
21. `assertValidToken` rejects `[keyword:reveal-cost-attack:2]` (spurious suffix) with
    non-zero exit and a full-sentence error message.
22. `assertValidToken` rejects `[keyword:reveal-odd-draw:1]` (spurious suffix) with
    non-zero exit and a full-sentence error message.
23. No files outside `## Files Expected to Change` were modified.
24. `DECISIONS.md` D-21901..D-21903 Active.
25. `reveal-cost-attack` preserves deck identity: the same `topCardId` remains at
    `deck[0]` after execution (AC-4 assertion includes this check).
26. `reveal-odd-draw` moves the exact revealed `topCardId` into hand when the odd branch
    fires — test asserts `hand.includes(topCardId)`, not just `hand.length` increase.

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

# After tooling changes — verify card-specific propose rows before editing curated map:
node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "reveal-cost-attack\|reveal-odd-draw"
# Expected: row for core/gambit/high-stakes-jackpot + row for msis/wanda-vision/witchcraft

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
- [ ] `NO_MAGNITUDE_KEYWORDS` Set exists and contains both new keywords; pre-check gate uses it.
- [ ] `reveal-cost-attack`: no zone mutation; `deck[0]` identity preserved; only `G.turnEconomy.attack` mutated; `G.turnEconomy` guard present.
- [ ] `reveal-odd-draw`: `cost % 2 !== 0` condition; cost-0 is even (no-op confirmed by test); identity guarantee tested (`topCardId` in hand).
- [ ] Drift-detection test updated to 13 keywords.
- [ ] 11 new test cases covering cost-3 attack grant (with deck[0] identity check), cost-0 attack grant, odd draw (with `topCardId`-in-hand check), even/zero no-op, empty deck, missing stats, undefined turnEconomy.
- [ ] `VALID_TOKEN_PATTERN` accepts `[keyword:reveal-cost-attack]` and `[keyword:reveal-odd-draw]`; rejects both with spurious `:N` suffixes.
- [ ] Both detection functions: reveal anchor present; regex-based; case-insensitive; idempotence guard uses own specific token.
- [ ] `collectProposeRowsForSet` routing order: compound-KO-or-draw → cost-attack → odd-draw → plain-KO → reveal-min → reveal.
- [ ] `hero-ability-markers.json` has 2 new entries; entries verified against `--propose` output.
- [ ] `data/cards/core.json` and `data/cards/msis.json` marked.
- [ ] `docs/ai/DECISIONS.md` D-21901..D-21903 Active.
- [ ] `docs/ai/STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md` updated.
- [ ] No files outside §Files Expected to Change were modified.

---

## Pre-Flight Report

**Target WP:** WP-219
**EC:** EC-251
**Pre-Flight Date:** 2026-06-05
**Class:** Behavior / State Mutation (mutates `G.turnEconomy.attack`, `playerZones.deck`, `playerZones.hand`)

### Vision Sanity Check

- **Vision clauses touched:** §22 Deterministic Eval — both executors read `G.cardStats[topCardId].cost` (setup-time resolved integer); no randomness introduced.
- **Conflict assertion:** No conflict: this WP preserves all touched clauses.
- **Non-Goal proximity:** N/A — WP touches no monetization or competitive surface.
- **Determinism preservation:** Confirmed. All cost comparisons read `G.cardStats[topCardId].cost` (setup-time populated, never mutated by executors). No `Math.random`, `Date.now`, or `ctx.random.*` introduced. No new randomness.
- **`## Vision Alignment` block:** N/A — `00.3 §17.1` triggers do not apply (no scoring, PAR, replay RNG, identity, leaderboard, or monetization surface).

### Dependency & Sequencing Check

| WP | Status | Notes |
|---|---|---|
| WP-218 | ✅ Done 2026-06-05 | commit `9c9215b`; `reveal-ko-or-draw`, `HERO_KEYWORDS` = 11, tests = 1133 all landed |

### Dependency Contract Verification

- [x] `moveCardFromZone(from, to, cardId)` — pure helper in `zoneOps.ts`; returns `{from, to, found}`; used by WP-218 `reveal-ko-or-draw` draw branch ✅
- [x] `G.cardStats[topCardId].cost` — `CardStatEntry.cost: number`; setup-time populated; accessed by `reveal-min` and `reveal-ko-or-draw` in WP-217/218 ✅
- [x] `G.turnEconomy.attack` — mutated by existing `'attack'` executor case; `G.turnEconomy` may be undefined; guard required (confirmed in WP §Assumes) ✅
- [x] `HERO_KEYWORDS` array + `HeroKeyword` union — exists in `heroKeywords.ts`; WP-218 extended both to exactly 11 entries ✅
- [x] `MVP_KEYWORDS` Set — exists in `heroEffects.execute.ts`; WP-218 extended it to include `reveal-ko-or-draw` ✅
- [x] `NO_MAGNITUDE_KEYWORDS` — WP scope explicitly handles creation-if-absent; §Assumes documents the extraction obligation ✅
- [x] `apply-hero-ability-markers.mjs` — `isRevealKoOrDrawCandidate` added in WP-218; `VALID_TOKEN_PATTERN` and routing structure established; extension-only ✅
- [x] `data/cards/core.json`, `data/cards/msis.json` — both files exist on disk ✅
- [x] No new types introduced that cross package boundaries — both new keywords are `HeroKeyword` string literals ✅

### Structural Readiness

All 12 source files in §Files Expected to Change exist on disk. No new directories created.
`NO_MAGNITUDE_KEYWORDS` creation pattern is scoped inside `heroEffects.execute.ts` — no new file.
`VALID_TOKEN_PATTERN` extension is additive-only; structure established by WP-215 through WP-218.

### Mutation Boundary Confirmation

- `reveal-cost-attack`: only `G.turnEconomy.attack` mutated; zero zone mutations; `playerZones.deck` MUST be identical after execution
- `reveal-odd-draw` odd branch: `playerZones.deck` shrinks by 1; `playerZones.hand` grows by 1; both assigned from `moveResult.from` and `moveResult.to`
- `reveal-odd-draw` even branch: no mutation
- No mutations to `G.piles`, `G.villainDeck`, `G.counters`, `G.hookRegistry`, or any other player's zones
- `G.cardStats` is read-only; no new `G` fields introduced

### Scope Lock

12 files + EC-251 + this report. Git allowlist is closed. Any file not in §Files Expected to Change is forbidden. `git diff --name-only` checked after completion.

### Test Expectations

| Suite | Before | Expected After | Delta |
|---|---|---|---|
| `game-engine` | 1133 | ≥ 1144 | +11 (5 cost-attack cases + 6 odd-draw cases) |

Drift-detection test: expects exactly **13** keywords (was 11).

### Risk Review

- `G.turnEconomy` guard risk — `G.turnEconomy` may be undefined in some test contexts; test must initialize it or the guard fires silently. Risk: low — `makeMockCtx` pattern from WP-218 test suite covers this.
- Cost-0 attack grant ambiguity — AC-5 asserts `attack += 0`; observable as "attack value unchanged." Test should assert the exact expected value, not infer from mutation absence. Risk: documentation clarity only; AC-5 is correctly written.
- `NO_MAGNITUDE_KEYWORDS` extraction — if the set doesn't yet exist, WP must create it by extracting the current chained exclusions. Risk: low — §Assumes and §Non-Negotiable Constraints both cover this obligation.
- Detection function reach — `isRevealCostAttackCandidate` and `isRevealOddDrawCandidate` target distinct phrases (`[icon:attack] equal to its cost` vs `cost is odd`); no corpus overlap expected. Risk: low.

### Verdict

**READY TO EXECUTE**

All dependencies met. Scope locked. Contract verified. Test delta quantified. No blocking risks.

---

## Copilot Check

**Date:** 2026-06-05
**Pre-flight verdict under review:** READY TO EXECUTE (2026-06-05)
**WP class:** Behavior / State Mutation — copilot check is mandatory.

### Overall Judgment

**PASS**

Pre-flight READY verdict stands. WP-219 is tightly scoped (8 source files + 4 governance). Both new executors follow the established `reveal-ko-or-draw` draw pattern exactly. Reveal anchor requirement closes the detection-function false-positive class. All 30 issues scanned; one minor RISK surfaced (issue 22) — documentation clarity only, no scope change required.

### Findings (non-PASS items only)

**22. [RISK] Cost-0 attack grant test assertion** — AC-5 asserts "`G.turnEconomy.attack` increases by 0; deck unchanged." A poorly-written test could misread this as "no-op" and pass vacuously (e.g., asserting `attack >= initialAttack` instead of `attack === initialAttack + 0`). The distinction is subtle but real: the executor fires and reads cost; the guard does NOT fire. The WP prose covers this ("executor fires; economy is touched even if by zero"), but a test author relying on the phrase "increases by 0" might implement a weaker assertion.
FIX: EC-251 §Locked Values already specifies `G.turnEconomy.attack += cardStats.cost` as the canonical form. The test setup should record `const attackBefore = G.turnEconomy.attack` and assert `G.turnEconomy.attack === attackBefore` (for cost-0) rather than checking delta > 0. This is scope-neutral. Added to Common Failure Smells consideration — already covered by EC-251 §Common Failure Smells "G.turnEconomy.attack unchanged after cost-3 reveal" smell (the inverse).

All other 29 issues: PASS.

Notable strong points:
- Issue 3 (Immer mutation vs pure helpers): `moveCardFromZone` returns new arrays; executor assigns into Immer draft — pattern correct and consistent with WP-218.
- Issue 4 (contract drift): HERO_KEYWORDS array + HeroKeyword union updated atomically; drift-detection test asserts exactly 13.
- Issue 11 (tests validate invariants): deck[0] identity (AC-25), topCardId-in-hand (AC-26), deck-length preservation, all guard paths covered.
- Issue 21 (magnitude gate): `NO_MAGNITUDE_KEYWORDS` Set replaces brittle chained exclusions; both new keywords included.
- Issue 27 (reveal anchor): required in both new detection functions; closes villain-line false-positive class.

### Mandatory Governance Follow-ups

- DECISIONS.md: D-21901, D-21902, D-21903 — drafted 2026-06-05; land at execution.

### Pre-Flight Verdict Disposition

- [x] CONFIRM — Pre-flight READY TO EXECUTE verdict stands. Session prompt generation authorized.

---

## Lint Gate Self-Review

**Date:** 2026-06-05 | **Verdict: PASS** (all applicable sections resolved)

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Work Packet Structure | PASS | All 10 required sections present and non-empty, including `## Non-Negotiable Constraints` |
| §2 | Non-Negotiable Constraints | PASS | No `.reduce()` in zone ops; zoneOps helpers for zone mutation; HERO_KEYWORDS parity; ESM/Node v22; no `@legendary-arena` imports in tooling; `NO_MAGNITUDE_KEYWORDS` set gate; reveal anchor in all detection functions |
| §3 | Prerequisites | PASS | WP-218 listed with commit `9c9215b`; D-21801..D-21803 cited; baseline 1133 tests cited; `G.turnEconomy.attack` mutation grounded in WP-218 context item |
| §4 | Context References | PASS | 11 context items; `ARCHITECTURE.md` added as item 11; `heroEffects.execute.ts` `'attack'` case listed as canonical `turnEconomy` pattern reference |
| §5 | Output Completeness | PASS | 12 files under §Files Expected to Change with change type |
| §6 | Naming Consistency | PASS | `reveal-cost-attack`, `reveal-odd-draw`, `isRevealCostAttackCandidate`, `isRevealOddDrawCandidate`, `NO_MAGNITUDE_KEYWORDS` consistent throughout |
| §7 | Dependency Discipline | PASS | No new npm deps; existing `moveCardFromZone` and `zoneOps.ts` helpers only |
| §8 | Architectural Boundaries | PASS | Engine changes in `packages/game-engine` only; tooling in `scripts/convert-cards/` (Shared Tooling); data in `data/cards/` only; no cross-layer imports |
| §9 | Windows Compatibility | N/A | Node built-ins only; no Windows-specific paths or APIs |
| §10 | Environment Variable Hygiene | N/A | No env vars touched |
| §11 | Authentication Clarity | N/A | No auth surface touched |
| §12 | Test Quality | PASS | 11 new test cases; branches include cost-0 no-draw (even), cost-0 attack-grant (valid 0), empty-deck no-op, missing-stats no-op, undefined-turnEconomy no-op, deck[0] identity (AC-25), topCardId-in-hand (AC-26) |
| §13 | Commands and Verification | PASS | 8 explicit commands with expected output; test count delta updated to ≥ 1144 |
| §14 | Acceptance Criteria Quality | PASS | 26 items; all binary and observable; count exceeds 6–12 guideline but established precedent per WP-218 (24 ACs passed) |
| §15 | Definition of Done | PASS | All governance files listed: DECISIONS.md, STATUS.md, WORK_INDEX.md, EC_INDEX.md |
| §16 | Code Style | PASS | `// why: D-21901` and `// why: D-21902` on executor cases; `NO_MAGNITUDE_KEYWORDS` `// why:` comment specified; full-sentence `assertValidToken` error required; reveal anchor in detection functions |
| §17 | Vision Alignment | N/A | Engine-only add of two executor keywords. No scoring, RNG, monetization, leaderboard, or competitive surface touched. No `## Vision Alignment` block required. |
| §18 | Prose-vs-Grep Discipline | N/A | No API endpoint claims |
| §19 | Bridge-vs-HEAD Staleness | PASS | Baseline commit `9c9215b` (WP-218) cited; HERO_KEYWORDS count of 11 quoted for pre-execution verification |
| §20 | Funding Surface Gate | N/A | No monetization surface touched; engine-only changes |
| §21 | API Endpoints Catalog | N/A | No HTTP endpoints added, modified, or removed |
