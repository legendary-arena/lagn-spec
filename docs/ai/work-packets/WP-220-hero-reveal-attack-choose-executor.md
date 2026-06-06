# WP-220 — Hero Reveal Attack-Choose Executor (Player-Choice Infrastructure + overhorns-and-underhorns)

**Status:** Draft
**Primary Layer:** Game Engine + Card Data + Offline Tooling
**Dependencies:** WP-219 (reveal executor family; `HERO_KEYWORDS` count = 13, tests = 1144)

---

## Session Context

> D-21903 (WP-219) deferred three reveal patterns requiring infrastructure not yet present.
> This WP addresses the first: `2099/ravage-2099/overhorns-and-underhorns` —
> "Reveal the top card of your deck. If it costs 4 or less, you get +[icon:attack] equal to
> its cost. Discard it or put it back."
>
> The distinguishing feature is the trailing player choice: **Discard it or put it back.**
> The current executor model is synchronous — `executeSingleEffect()` fires and returns.
> There is no mechanism in G for a pending decision that a subsequent player move resolves.
>
> This WP designs and lands that mechanism: a `G.pendingHeroChoice` field plus a
> `resolveHeroChoice` move. The overhorns card becomes the first live user of the
> infrastructure. The two remaining D-21903 deferrals (KO+attack compound,
> villain odd-draw) are NOT addressed here.

---

## Goal

After this packet:

- A `G.pendingHeroChoice` optional field exists on `LegendaryGameState`, typed and validated.
- A `resolveHeroChoice` move resolves an outstanding player choice (discard or return to top).
- A new `reveal-attack-choose` executor sets `G.pendingHeroChoice` after granting the
  conditional attack; card stays on deck until the player resolves the choice.
- `2099/ravage-2099/overhorns-and-underhorns` is marked with `[keyword:reveal-attack-choose:4]`.
- Turn-end is blocked while `G.pendingHeroChoice !== undefined`.
- D-21903 item 1 is closed; items 2 and 3 remain deferred.

---

## Assumes

- WP-219 shipped: `HERO_KEYWORDS` = 13, tests = 1144. Commit `dc6df11` on `origin/main`.
- `G.pendingHeroChoice` does not exist in `LegendaryGameState` before this WP executes.
  This WP creates it as a new optional field (`PendingHeroChoice | undefined`).
- `G.pendingHeroChoice` is `PendingHeroChoice | undefined` — `undefined` is locked as the absent-value
  form. This is consistent with all other optional G fields (e.g., `villainRevealedThisTurn?: boolean`).
  `null` is never used for absent G state in this codebase.
- `G.cardStats[topCardId].cost` is available at executor time (same guarantee as WP-219).
- `moveCardFromZone(deck, discard, cardId)` handles the discard branch.
- "Put it back" = card stays at `deck[0]` — no mutation (identical to reveal-cost-attack).
- A cost-0 or cost > magnitude card still triggers the player-choice prompt.
  The choice is not conditional on whether the attack grant fired.
- Turn-end gating is enforced by checking `G.pendingHeroChoice !== undefined` at the top of the
  `endTurn` function body in `packages/game-engine/src/moves/coreMoves.impl.ts`, immediately
  before `events.endTurn()` at line ~157. If set, `endTurn` returns silently without calling
  `events.endTurn()`. This callsite is locked; do not add a second guard elsewhere.
- `KEYWORD_PATTERN` already allows hyphens (WP-217); `reveal-attack-choose` is valid.

---

## Non-Negotiable Constraints

### Engine
- No `.reduce()` in zone operations or effect application.
- Zone mutations go through `zoneOps.ts` helpers.
- `G.pendingHeroChoice` is `PendingHeroChoice | undefined` (`undefined` locked — see §Assumes).
  It may only be set by the `reveal-attack-choose` executor and cleared by `resolveHeroChoice`.
- `resolveHeroChoice` validates that `G.pendingHeroChoice` is set and that the requesting
  player matches `pendingHeroChoice.playerID`; mismatched or absent pending state is a
  silent no-op (move never throws).
- `G.pendingHeroChoice` must be `undefined` at turn-end; the `ctx.events.endTurn()` call
  site in `coreMoves.impl.ts:endTurn()` must check and return silently if it is set.
- `HERO_KEYWORDS` canonical array and `HeroKeyword` union must stay in parity.
  Drift-detection test must pass at exactly 14 after this packet.
- Both the `reveal-attack-choose` executor AND the `resolveHeroChoice` move must emit
  silent no-ops on empty deck, missing stats, missing/wrong pending state.
  No throw. No log.
- All `ctx.events.setPhase()` and `ctx.events.endTurn()` calls require a `// why:` comment.

### Tooling
- ESM-only, Node v22+ — no `require()`, no `node-fetch`.
- No `@legendary-arena/*` imports in `scripts/convert-cards/`. Offline Shared Tooling only.
- All detection functions require the reveal anchor `/Reveal the top card of your deck\./i`.
- `assertValidToken` must reject `[keyword:reveal-attack-choose]` (missing magnitude) and
  `[keyword:reveal-attack-choose:0]` (zero threshold invalid).

### Data
- Only surgical token appends — no structural JSON changes to `data/cards/*.json`.
- Run `--propose` before editing `hero-ability-markers.json` — never skip.

### Locked Contract Values (locked by EC-252)
- Keyword string: `'reveal-attack-choose'` (exact form — do not re-derive at execution time)
- Magnitude: cost ceiling for the attack grant (4 for overhorns)
- Token form: `[keyword:reveal-attack-choose:N]` — magnitude required, no-magnitude form invalid
- Attack grant condition: `cardStats.cost <= effect.magnitude` — attack is NOT granted when cost > magnitude
- Attack grant amount: `G.turnEconomy.attack += cardStats.cost` (cost, not magnitude)
- `resolveHeroChoice` resolution values: `'discard'` | `'return'` (exact strings — EC locks)
- `PendingHeroChoice.choiceType`: `'discard-or-return'` (exact string)

---

## Context (Read First)

1. `packages/game-engine/src/types.ts` — `LegendaryGameState` (add `pendingHeroChoice` here);
   `TurnEconomy` (attack mutation pattern)
2. `packages/game-engine/src/hero/heroEffects.execute.ts` — `reveal-cost-attack` case
   (canonical peek + no-mutation pattern); `NO_MAGNITUDE_KEYWORDS` set; pre-check gate
3. `packages/game-engine/src/moves/coreMoves.impl.ts` — existing moves (endTurn callsite
   or equivalent — locate where `ctx.events.endTurn()` is called from the cleanup stage)
4. `packages/game-engine/src/rules/heroKeywords.ts` — `HeroKeyword` union + `HERO_KEYWORDS`
5. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection test (13 → 14)
6. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — tests 37-41 (reveal-cost-attack
   cases — reference for reveal-attack-choose test structure)
7. `scripts/convert-cards/apply-hero-ability-markers.mjs` — `VALID_TOKEN_PATTERN`; routing order
8. `scripts/convert-cards/inputs/hero-ability-markers.json` — curated map
9. `data/cards/2099.json` — overhorns-and-underhorns card
10. `docs/ai/DECISIONS.md` — D-21903 (the deferral this WP closes, partially)
11. `docs/ai/ARCHITECTURE.md` — Layer Boundary; G is runtime-only; moves never throw

---

## Scope (In)

### Engine — New Field, New Type, New Keyword, New Move

1. **Add `PendingHeroChoice` type** to `types.ts` (or a new `heroChoice.types.ts` if the
   execution session determines the type is large enough to warrant a separate file):

   ```typescript
   export interface PendingHeroChoice {
     choiceType: 'discard-or-return';
     cardId: CardExtId;
     playerID: string;
   }
   ```

2. **Add `pendingHeroChoice` field** to `LegendaryGameState`:

   ```typescript
   pendingHeroChoice?: PendingHeroChoice;
   ```

   Optional (`?`) so existing full-G literals in tests do not need updating.

3. **Add `'reveal-attack-choose'` to `HeroKeyword` union + `HERO_KEYWORDS` array** in
   `heroKeywords.ts`. Add with a `// why: D-22003` citation. Position after `'reveal-odd-draw'`
   (before `'conditional'`). Count becomes 14.

4. **Add `'reveal-attack-choose'` to `MVP_KEYWORDS`** in `heroEffects.execute.ts`.
   Do NOT add to `NO_MAGNITUDE_KEYWORDS` — this keyword requires a valid magnitude (cost ceiling).

5. **Add `'reveal-attack-choose'` executor branch** in `executeSingleEffect()`,
   after `reveal-odd-draw`:

   ```typescript
   case 'reveal-attack-choose': {
     // why: reveal-attack-choose peeks deck top; grants attack equal to cost when
     // cost <= magnitude; then stores a pending choice (discard or return) that
     // the player must resolve via resolveHeroChoice before the turn can end (D-22003)
     if (!isValidMagnitude(effect.magnitude) || effect.magnitude < 1) { break; }
     // why: reject-second — a pending choice is never silently overwritten; the first
     // choice's data integrity is preserved until the player resolves it (D-22001)
     if (G.pendingHeroChoice !== undefined) { break; }
     const playerZones = G.playerZones[playerID];
     if (!playerZones) { break; }
     if (playerZones.deck.length === 0) { break; }
     const topCardId = playerZones.deck[0];
     if (!topCardId) { break; }
     const cardStats = G.cardStats[topCardId];
     if (cardStats === undefined) { break; }
     if (!G.turnEconomy) { break; }
     // NOTE: G.pendingHeroChoice is set AFTER the G.turnEconomy guard.
     // If G.turnEconomy is undefined the break fires here and G.pendingHeroChoice is
     // NOT set. Tests must verify this (see AC-8b).
     if (cardStats.cost <= (effect.magnitude as number)) {
       G.turnEconomy.attack += cardStats.cost;
     }
     // Card stays on deck until player resolves the choice.
     G.pendingHeroChoice = {
       choiceType: 'discard-or-return',
       cardId: topCardId,
       playerID,
     };
     break;
   }
   ```

   **Key invariants:**
   - Attack grant is conditional (`cost <= magnitude`); choice prompt fires only if all guards pass.
   - A second `reveal-attack-choose` while a choice is already pending is a silent no-op
     (reject-second, per D-22001). No queue. No overwrite.
   - `G.pendingHeroChoice` is NOT set when `G.turnEconomy` is undefined — the guard fires
     before the pending assignment. AC-8b tests this explicitly.
   - Card stays at `deck[0]` until `resolveHeroChoice` fires.

6. **Add `resolveHeroChoice` move** (new file or added to existing moves file per the
   execution session's judgment — one move, new or existing):

   ```typescript
   function resolveHeroChoice(
     G: LegendaryGameState,
     ctx: unknown,
     playerID: string,
     resolution: 'discard' | 'return',
   ): void {
     // why: resolves a pending hero reveal choice; clears G.pendingHeroChoice;
     // no-op if no pending choice or wrong player (D-22002)
     if (!G.pendingHeroChoice) { return; }
     if (G.pendingHeroChoice.playerID !== playerID) { return; }
     if (G.pendingHeroChoice.choiceType !== 'discard-or-return') { return; }
     const pendingChoice = G.pendingHeroChoice;
     G.pendingHeroChoice = undefined;
     if (resolution === 'discard') {
       const playerZones = G.playerZones[playerID];
       if (!playerZones) { return; }
       const moveResult = moveCardFromZone(playerZones.deck, playerZones.discard, pendingChoice.cardId);
       if (moveResult.found) {
         playerZones.deck = moveResult.from;
         playerZones.discard = moveResult.to;
       }
     }
     // resolution === 'return': card already at deck[0]; no mutation needed.
   }
   ```

7. **Turn-end guard**: locate the site where `ctx.events.endTurn()` is called from the
   cleanup stage (likely in `coreMoves.impl.ts` or the turn-phase logic). Add a guard that
   returns silently when `G.pendingHeroChoice !== undefined`:

   ```typescript
   if (G.pendingHeroChoice !== undefined) {
     // why: turn cannot end while a player-choice reveal is pending; player must
     // call resolveHeroChoice first (D-22002)
     return;
   }
   ```

8. **Tests** in `heroEffects.execute.test.ts` and a new `heroChoice.resolve.test.ts`
   (or appended to an existing test file):

   For `reveal-attack-choose` executor (≥8 new cases):
   - cost-2 top card with magnitude-4: attack +2; `G.pendingHeroChoice` set; card still at `deck[0]`
   - cost-5 top card with magnitude-4: attack unchanged (cost > magnitude); `G.pendingHeroChoice` still set; card at `deck[0]`
   - cost-0 top card: attack +0 (even, still within threshold); `G.pendingHeroChoice` set
   - empty deck: no-op; `G.pendingHeroChoice` NOT set
   - missing cardStats: no-op; `G.pendingHeroChoice` NOT set
   - `G.turnEconomy` undefined: no-op; `G.pendingHeroChoice` NOT set (guard fires before assignment — AC-8b)
   - Second call while `G.pendingHeroChoice` already set: no-op; original pending unchanged (AC-8c)
   - undefined magnitude: skipped (pre-check gate); no mutation
   - magnitude-0: skipped (< 1 guard); no mutation

   For `resolveHeroChoice` move (≥8 new cases):
   - `resolution = 'discard'`: card moves from deck to discard; `G.pendingHeroChoice` cleared
   - `resolution = 'return'`: card stays at `deck[0]`; `G.pendingHeroChoice` cleared
   - no pending choice: no-op; no mutation
   - wrong player: no-op; pending choice unchanged
   - wrong choiceType (defensive): no-op
   - discard with card no longer at deck[0] (defensive — card moved by another effect): `moveResult.found = false`; pending cleared anyway
   - turn-end guard fires while pending choice outstanding: no endTurn mutation

### Tooling — `apply-hero-ability-markers.mjs`

9. **Extend `VALID_TOKEN_PATTERN`** to accept `[keyword:reveal-attack-choose:N]` (magnitude ≥ 1
   required; no-suffix form invalid):

   Add `|^\[keyword:reveal-attack-choose:\d+\]$` — the `\d+` branch only, no bare form.

10. **Add `isRevealAttackChooseCandidate(line)` detection function.**
    A line qualifies IFF ALL of the following are true:
    - `/Reveal the top card of your deck\./i` matches (reveal anchor — required)
    - `/\[icon:attack\]/` matches
    - `/equal to (?:its|that card's) cost/i` matches (reuse WP-219's regex)
    - `/Discard it or put it back/i` matches (distinguishes from plain reveal-cost-attack)
    - Does NOT contain `'Villain Deck'` or `'Master Strike'`
    - Does NOT contain `'[keyword:reveal-attack-choose'` (idempotence guard)

11. **Add `suggestRevealAttackChooseToken(line)` function.**
    Extracts the cost ceiling from "If it costs N or less" / "costs N or less":
    ```javascript
    function suggestRevealAttackChooseToken(line) {
      const match = line.match(/costs? (\d+) or less/i);
      if (match) return `[keyword:reveal-attack-choose:${match[1]}]`;
      return null; // no ceiling extractable; caller must guard before emitting
    }
    ```

12. **Update `collectProposeRowsForSet()` routing:** insert `isRevealAttackChooseCandidate`
    BEFORE `isRevealCostAttackCandidate` in the routing chain (compound-with-choice takes
    priority over unconditional cost-attack):

    Authoritative routing order after this WP:
    1. `isRevealKoOrDrawCandidate` (compound KO-or-draw)
    2. `isRevealAttackChooseCandidate` (NEW — compound attack + player choice)
    3. `isRevealCostAttackCandidate` (unconditional attack grant)
    4. `isRevealOddDrawCandidate`
    5. `isRevealKoCandidate`
    6. `isRevealMinCandidate`
    7. `isRevealCandidate`

### Data

13. **Add 1 new entry** to `hero-ability-markers.json`:

    ```json
    "2099": [
      { "heroSlug": "ravage-2099", "cardSlug": "overhorns-and-underhorns",
        "abilityIndex": 0, "markupToken": "[keyword:reveal-attack-choose:4]" }
    ]
    ```

    Run `--propose` BEFORE editing the map to confirm the slug and index.

14. **Apply markup.** `Updated: 1` on first run. Idempotence on second run.

---

## Out of Scope

- `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner`: KO + attack compound — multi-branch;
  remains deferred in D-21903.
- Villain odd-draw (Poison Scarlet Witch): villain pipeline; remains deferred in D-21903.
- Other player-choice reveal patterns (e.g., "Draw it or put it back") — deferred until this
  WP's infrastructure proves stable.
- Choice queue / multi-pending-choice support — reject-second (no overwrite) is the v1 policy.
  Queue support deferred.
- UI rendering of the pending choice prompt — client concern, not engine scope.
- Disconnect/reconnect behavior while choice is pending — deferred.
- Any engine changes beyond `types.ts`, `heroKeywords.ts`, `heroEffects.execute.ts`,
  and the new move file.

---

## Files Expected to Change

**Engine (modified):**
1. `packages/game-engine/src/types.ts` — add `PendingHeroChoice` interface + `pendingHeroChoice?` field to `LegendaryGameState`
2. `packages/game-engine/src/rules/heroKeywords.ts` — add `'reveal-attack-choose'`

**Engine (modified or new — execution session decides):**
3. `packages/game-engine/src/hero/heroEffects.execute.ts` — add `reveal-attack-choose` executor case
4. `packages/game-engine/src/moves/heroChoice.resolve.ts` — new file for `resolveHeroChoice` move (OR added to existing moves file if the execution session determines no new file is warranted)

**Engine — turn-end gate (modified):**
5. `packages/game-engine/src/moves/coreMoves.impl.ts` (or equivalent `ctx.events.endTurn()` callsite) — pending-choice guard

**Engine tests (modified or new):**
6. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — ≥8 new `reveal-attack-choose` cases
7. `packages/game-engine/src/hero/heroChoice.resolve.test.ts` — new file; ≥8 `resolveHeroChoice` cases
8. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection test 13 → 14

**Tooling (modified):**
9. `scripts/convert-cards/apply-hero-ability-markers.mjs` — extend `VALID_TOKEN_PATTERN`; add `isRevealAttackChooseCandidate`, `suggestRevealAttackChooseToken`; update routing

**Data (modified):**
10. `scripts/convert-cards/inputs/hero-ability-markers.json` — 1 new entry
11. `data/cards/2099.json` — overhorns-and-underhorns abilityIndex=0 markup

**Governance:**
12. `docs/ai/DECISIONS.md` — D-22001..D-22003
13. `docs/ai/STATUS.md` — WP-220 executed
14. `docs/ai/work-packets/WORK_INDEX.md` — WP-220 `[ ]` → `[x]`
15. `docs/ai/execution-checklists/EC_INDEX.md` — EC-252 Draft → Done

Up to 15 files. The execution session determines whether `heroChoice.resolve.ts` is new or co-located with existing moves.

---

## Contract

### New Field `G.pendingHeroChoice` (D-22001)

| Field | Type | Semantics |
|---|---|---|
| `G.pendingHeroChoice` | `PendingHeroChoice \| undefined` | Set by `reveal-attack-choose` executor; cleared by `resolveHeroChoice`. Absent (`undefined`) = no pending choice. Second `reveal-attack-choose` call while set is rejected (no overwrite). |

**`PendingHeroChoice`:**
- `choiceType: 'discard-or-return'` — closed discriminant for future extensibility
- `cardId: CardExtId` — the revealed card still at `deck[0]`
- `playerID: string` — only this player's `resolveHeroChoice` call is accepted

**Invariants:**
- Only set inside the `reveal-attack-choose` executor case.
- Only cleared inside `resolveHeroChoice`.
- `undefined` is the resting state between turns.
- A second `reveal-attack-choose` executor call while this field is set is a silent no-op
  (reject-second, D-22001). The original pending choice is not overwritten.
- At `ctx.events.endTurn()`, must be `undefined`; the turn-end call site in
  `coreMoves.impl.ts:endTurn()` returns silently if set.

### New Move `resolveHeroChoice` (D-22002)

| Arg | Type | Semantics |
|---|---|---|
| `resolution` | `'discard' \| 'return'` | `'discard'`: move card from `deck[0]` to player's `discard`. `'return'`: no mutation; card stays. |

**No-ops (silent return):**
- `G.pendingHeroChoice` is `undefined`
- `G.pendingHeroChoice.playerID !== playerID`
- `G.pendingHeroChoice.choiceType !== 'discard-or-return'`

**Invariant:** `G.pendingHeroChoice` is always cleared before this function returns — even if the subsequent zone move fails (`moveResult.found = false`).

### New Keyword `reveal-attack-choose` (D-22003)

| Token | Executor | Semantics |
|---|---|---|
| `[keyword:reveal-attack-choose:N]` | `reveal-attack-choose` | Peek deck top; `G.turnEconomy.attack += cardStats.cost` when `cost <= N`; always sets `G.pendingHeroChoice`; card stays at `deck[0]` until choice resolved. |

**Magnitude required.** No-suffix form `[keyword:reveal-attack-choose]` is invalid.
`assertValidToken` must reject it and reject magnitude-0 form.

---

## Decisions to Reserve

- **D-22001** — `G.pendingHeroChoice` field on `LegendaryGameState`: type `PendingHeroChoice | undefined`,
  absent-value = `undefined` (locked), write/clear ownership, reject-second overwrite policy.
- **D-22002** — `resolveHeroChoice` move: argument type (`'discard' | 'return'`), no-op
  conditions, pending-always-cleared invariant, turn-end guard at `coreMoves.impl.ts:endTurn()`.
- **D-22003** — New `reveal-attack-choose` HeroKeyword: executor peeks deck top,
  conditional attack grant (`cost <= magnitude`), unconditional choice prompt. First card:
  `2099/ravage-2099/overhorns-and-underhorns` with magnitude 4.

---

## Acceptance Criteria

1. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no new failures.
2. `pnpm -r build` exits 0.
3. `HERO_KEYWORDS` array and `HeroKeyword` union both contain `'reveal-attack-choose'`;
   drift-detection test passes (14 keywords).
4. `reveal-attack-choose` with cost-2 top card (magnitude 4): `G.turnEconomy.attack` += 2;
   `G.pendingHeroChoice` set; `deck[0]` still equals the same cardId.
5. `reveal-attack-choose` with cost-5 top card (magnitude 4): `G.turnEconomy.attack` unchanged;
   `G.pendingHeroChoice` still set; `deck[0]` unchanged.
6. `reveal-attack-choose` with cost-0 top card: `G.turnEconomy.attack` += 0 (executor fires);
   `G.pendingHeroChoice` set.
7. `reveal-attack-choose` with empty deck: no-op; `G.pendingHeroChoice` NOT set.
8. `reveal-attack-choose` with missing cardStats: no-op; `G.pendingHeroChoice` NOT set.
8b. `reveal-attack-choose` with `G.turnEconomy` undefined: no-op; `G.pendingHeroChoice` NOT set
    (turnEconomy guard fires before the pending assignment — ordering matters).
8c. Second `reveal-attack-choose` while `G.pendingHeroChoice` is already set: silent no-op;
    original pending choice is unchanged (reject-second).
9. `reveal-attack-choose` with undefined magnitude: skipped; no mutation.
10. `resolveHeroChoice('discard')`: card moves deck→discard; `G.pendingHeroChoice` cleared.
11. `resolveHeroChoice('return')`: card stays at `deck[0]`; `G.pendingHeroChoice` cleared.
12. `resolveHeroChoice` with no pending choice: no-op; no mutation.
13. `resolveHeroChoice` with wrong playerID: no-op; pending choice unchanged.
14. Turn-end guard: when `G.pendingHeroChoice` is set, the `ctx.events.endTurn()` callsite
    returns without calling `endTurn`.
15. `--propose` output includes row for `2099 | ravage-2099 | overhorns-and-underhorns |
    abilityIndex=0 | … | suggested=[keyword:reveal-attack-choose:4]`.
16. `apply-hero-ability-markers.mjs` reports `Updated: 1` on first run; zero diff on second run.
17. `--validate` exits 0 after apply.
18. `grep "\[keyword:reveal-attack-choose:4\]" data/cards/2099.json | wc -l` = 1.
19. `assertValidToken` rejects `[keyword:reveal-attack-choose]` (missing magnitude).
20. `assertValidToken` rejects `[keyword:reveal-attack-choose:0]` (zero magnitude).
21. `G.pendingHeroChoice` is `undefined` (never defined) at game setup — existing setup
    tests continue to pass without modification.
22. No files outside §Files Expected to Change were modified.
23. D-22001..D-22003 Active in `docs/ai/DECISIONS.md`.

---

## Verification Steps

```bash
# Baseline
pnpm --filter @legendary-arena/game-engine test
# Expected: 1144 pass (WP-219 baseline)

git diff --name-only data/cards/ packages/game-engine/
# Expected: empty

# Confirm overhorns not yet marked
grep "reveal-attack-choose" data/cards/2099.json
# Expected: empty

# After engine changes:
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; test count ≥ 1160 (1144 + ≥16 new cases)

# Tooling check:
node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "reveal-attack-choose\|overhorns"
# Expected: row for 2099/ravage-2099/overhorns-and-underhorns

# Apply
node scripts/convert-cards/apply-hero-ability-markers.mjs
# Expected: Updated: 1

# Idempotence
node scripts/convert-cards/apply-hero-ability-markers.mjs
git diff data/cards/
# Expected: no output

node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
# Expected: exits 0

grep "\[keyword:reveal-attack-choose:4\]" data/cards/2099.json | wc -l
# Expected: 1

pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria above are met.
- [ ] `PendingHeroChoice` interface + `G.pendingHeroChoice?` field in `types.ts`.
- [ ] `'reveal-attack-choose'` in `HeroKeyword` union + `HERO_KEYWORDS` array (count = 14).
- [ ] `reveal-attack-choose` executor in `heroEffects.execute.ts` with `// why: D-22003`.
- [ ] `resolveHeroChoice` move with no-op guards and `// why: D-22002` comment on pending-clear.
- [ ] Turn-end guard at `ctx.events.endTurn()` callsite with `// why: D-22002` comment.
- [ ] ≥16 new tests covering executor cases + resolveHeroChoice cases + turn-end guard.
- [ ] `VALID_TOKEN_PATTERN` accepts `[keyword:reveal-attack-choose:N]`; rejects bare form and `:0` form.
- [ ] `isRevealAttackChooseCandidate` has reveal anchor + discard-or-return phrase; routes BEFORE `isRevealCostAttackCandidate`.
- [ ] `hero-ability-markers.json` entry for `2099/ravage-2099/overhorns-and-underhorns`.
- [ ] `data/cards/2099.json` overhorns card marked.
- [ ] `docs/ai/DECISIONS.md` D-22001..D-22003 Active.
- [ ] `docs/ai/STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md` updated.
- [ ] No files outside §Files Expected to Change were modified.
