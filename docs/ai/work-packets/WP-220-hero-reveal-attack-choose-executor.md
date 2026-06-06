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
- Turn-end is blocked while `G.pendingHeroChoice !== undefined` at **both** turn-end callsites
  (the `endTurn` move and the `advanceStage` move at the cleanup stage).
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
- Turn-end occurs through **TWO** callsites, both of which must be guarded:
  1. The `endTurn` move (`coreMoves.impl.ts` `endTurn()`, which calls `events.endTurn()` at line ~157).
     The guard goes at the **top** of `endTurn()` — after the stage-gate check (line ~138) but
     **before** the inPlay→discard / hand→discard sweep (lines ~146-152). If the guard sat
     immediately before `events.endTurn()`, the hand would already be swept to discard before the
     guard returned, corrupting state. Guard-then-return discards nothing.
  2. The `advanceStage` move (`game.ts` `advanceStage()`), which delegates to `advanceTurnStage`
     (`turnLoop.ts`). At the `cleanup` stage, `getNextTurnStage('cleanup')` returns `null`, so
     `advanceTurnStage` calls `events.endTurn()` directly. `advanceStage` has **no stage gate** and
     is exposed to real clients as "Pass Priority" (`arena-client` `useTurnActions`), so a player with
     a pending choice could end the turn this way unless `advanceStage` is also guarded.
  A guard on `endTurn` alone is insufficient — `advanceStage` bypasses it.
- `KEYWORD_PATTERN` already allows hyphens (WP-217); `reveal-attack-choose` is valid.

---

## Non-Negotiable Constraints

### Engine
- No `.reduce()` in zone operations or effect application.
- Zone mutations go through `zoneOps.ts` helpers.
- `G.pendingHeroChoice` is `PendingHeroChoice | undefined`. `undefined` is the only locked absent-value form.
- `G.pendingHeroChoice` may only be set by the `reveal-attack-choose` executor and may only be cleared by `resolveHeroChoice`.
- `resolveHeroChoice` validates that `G.pendingHeroChoice` is set and that the requesting
  player matches `pendingHeroChoice.playerID`; mismatched or absent pending state is a
  silent no-op (move never throws).
- `G.pendingHeroChoice` must be `undefined` at every turn-end. BOTH turn-end callsites must guard it:
  (a) `endTurn()` in `coreMoves.impl.ts` checks `G.pendingHeroChoice !== undefined` at the top of the
  function (before the inPlay/hand→discard sweep) and returns silently if set; (b) `advanceStage()` in
  `game.ts` checks `G.currentStage === 'cleanup' && G.pendingHeroChoice !== undefined` before delegating
  to `advanceTurnStage` and returns silently if set. The `endTurn`-only guard is insufficient because
  `advanceStage` reaches `events.endTurn()` via `turnLoop.ts` at the cleanup stage.
- `HERO_KEYWORDS` canonical array and `HeroKeyword` union must stay in parity.
  Drift-detection test must pass at exactly 14 after this packet.
- Executor silent no-op conditions: empty deck, missing `playerZones`, missing top card,
  missing `cardStats`, invalid or absent magnitude, `G.turnEconomy` undefined, pre-existing
  `G.pendingHeroChoice`. No throw. No log.
- `resolveHeroChoice` silent no-op conditions: missing pending choice, wrong player, unexpected
  `choiceType`. No throw. No log.
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
3. `packages/game-engine/src/moves/coreMoves.impl.ts` — the `endTurn` move; the `endTurn()` guard
   goes at the top, before the inPlay/hand→discard sweep (~lines 141-152), and before `events.endTurn()`
4. `packages/game-engine/src/game.ts` — the `advanceStage` move (delegates to `advanceTurnStage`) and
   the `moves:` registration map; `MoveContext` type alias (`FnContext<LegendaryGameState> & { playerID }`)
5. `packages/game-engine/src/turn/turnLoop.ts` + `turn/turnPhases.logic.ts` — `advanceTurnStage` calls
   `events.endTurn()` when `getNextTurnStage('cleanup')` returns `null` (the second turn-end path)
6. `packages/game-engine/src/rules/heroKeywords.ts` — `HeroKeyword` union + `HERO_KEYWORDS`
7. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection test (13 → 14)
8. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — tests 37-41 (reveal-cost-attack
   cases — reference for reveal-attack-choose test structure)
9. `scripts/convert-cards/apply-hero-ability-markers.mjs` — `VALID_TOKEN_PATTERN`; routing order
10. `scripts/convert-cards/inputs/hero-ability-markers.json` — curated map
11. `data/cards/2099.json` — overhorns-and-underhorns card
12. `docs/ai/DECISIONS.md` — D-21903 (the deferral this WP closes, partially)
13. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code constraints (named-export imports,
    `// why:` comments, full-sentence errors, descriptive names)
14. `docs/ai/ARCHITECTURE.md` — Layer Boundary; G is runtime-only; moves never throw

---

## Scope (In)

### Engine — New Field, New Type, New Keyword, New Move

1. **Add `PendingHeroChoice` type** to `types.ts` (locked home — do not create a separate
   `heroChoice.types.ts`; that would add an unlisted file):

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
     // NOT set. Tests must verify this (see AC-9).
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
     before the pending assignment. AC-9 tests this explicitly.
   - Card stays at `deck[0]` until `resolveHeroChoice` fires.

6. **Add `resolveHeroChoice` move** to new file `packages/game-engine/src/moves/heroChoice.resolve.ts`.
   It is a boardgame.io move, so it MUST use the `(context, args)` signature every live move uses
   (`drawCards`, `playCard`, `endTurn` in `coreMoves.impl.ts`) — a single destructured `MoveContext`
   object as arg 1 and the payload as arg 2. A positional `(G, ctx, playerID, resolution)` signature is
   wrong: boardgame.io 0.50.x binds the context object to the first parameter, so `resolution` would
   never arrive. Declare `MoveContext` and `ResolveHeroChoiceArgs` locally (house style — each move
   file declares the alias rather than importing it):

   ```typescript
   import type { FnContext, PlayerID } from 'boardgame.io';
   import type { LegendaryGameState } from '../types.js';
   import { moveCardFromZone } from './zoneOps.js';

   /** Move context provided by boardgame.io 0.50.x to every move function. */
   type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

   /** Payload for the resolveHeroChoice move. */
   export interface ResolveHeroChoiceArgs {
     resolution: 'discard' | 'return';
   }

   /**
    * Resolves a pending hero reveal choice (discard the revealed card or
    * return it to the top of the deck), then clears G.pendingHeroChoice.
    *
    * @param context - boardgame.io move context with G and playerID.
    * @param args - the resolution choice ('discard' | 'return').
    */
   export function resolveHeroChoice({ G, playerID }: MoveContext, args: ResolveHeroChoiceArgs): void {
     // Step 1: validate args — unknown resolution is a silent no-op (moves never throw)
     if (args.resolution !== 'discard' && args.resolution !== 'return') { return; }
     // Step 2: validate pending state — no-op if no pending choice, wrong player, or wrong type
     if (!G.pendingHeroChoice) { return; }
     if (G.pendingHeroChoice.playerID !== playerID) { return; }
     if (G.pendingHeroChoice.choiceType !== 'discard-or-return') { return; }
     // Step 3: mutate G — clear pending FIRST so it is cleared even if the zone move fails
     const pendingChoice = G.pendingHeroChoice;
     // why: pending choice is always cleared before return, even when moveResult.found is
     // false, so a stale pending state can never wedge the turn-end guard (D-22002)
     G.pendingHeroChoice = undefined;
     if (args.resolution === 'discard') {
       const playerZones = G.playerZones[playerID];
       if (!playerZones) { return; }
       const moveResult = moveCardFromZone(playerZones.deck, playerZones.discard, pendingChoice.cardId);
       if (moveResult.found) {
         playerZones.deck = moveResult.from;
         playerZones.discard = moveResult.to;
       }
     }
     // args.resolution === 'return': card already at deck[0]; no mutation needed.
   }
   ```

7. **Move registration + advanceStage guard** in `packages/game-engine/src/game.ts`:
   - Import: `import { resolveHeroChoice } from './moves/heroChoice.resolve.js';`
   - Register: `resolveHeroChoice: { move: resolveHeroChoice, client: false }` in the `moves:` map
   - Add the second turn-end guard inside `advanceStage()` (the first guard is in `endTurn`, item 8):

     ```typescript
     function advanceStage({ G, events }: MoveContext): void {
       // why: turn cannot end while a player-choice reveal is pending; at cleanup,
       // advanceTurnStage would otherwise call events.endTurn() and bypass the
       // endTurn-move guard (D-22002)
       if (G.currentStage === 'cleanup' && G.pendingHeroChoice !== undefined) { return; }
       advanceTurnStage(G, { events: { endTurn: () => events.endTurn() } });
     }
     ```

8. **Turn-end guard** at the **top** of the `endTurn()` function body in
   `packages/game-engine/src/moves/coreMoves.impl.ts` — after the stage-gate check, **before** the
   inPlay→discard / hand→discard sweep (placing it later would discard the hand before the guard
   returned):

   ```typescript
   // why: turn cannot end while a player-choice reveal is pending; the player must
   // call resolveHeroChoice first. Guard precedes the zone sweep so a blocked turn
   // does not discard the hand (D-22002)
   if (G.pendingHeroChoice !== undefined) {
     return;
   }
   ```

9. **Tests** in `heroEffects.execute.test.ts` and new `heroChoice.resolve.test.ts`:

   For `reveal-attack-choose` executor (≥9 new cases):
   - cost-2 top card with magnitude-4: attack +2; `G.pendingHeroChoice` set; card still at `deck[0]`
   - cost-5 top card with magnitude-4: attack unchanged (cost > magnitude); `G.pendingHeroChoice` still set; card at `deck[0]`
   - cost-0 top card: attack +0; `G.pendingHeroChoice` set
   - empty deck: no-op; `G.pendingHeroChoice` NOT set
   - missing cardStats: no-op; `G.pendingHeroChoice` NOT set
   - `G.turnEconomy` undefined: no-op; `G.pendingHeroChoice` NOT set (turnEconomy guard fires before pending assignment)
   - second call while `G.pendingHeroChoice` already set: no-op; original pending unchanged (reject-second)
   - undefined magnitude: skipped (pre-check gate); no mutation
   - magnitude-0: skipped (< 1 guard); no mutation

   For `resolveHeroChoice` move + turn-end guards (≥8 new cases):
   - `resolution = 'discard'`: card moves from deck to discard; `G.pendingHeroChoice` cleared
   - `resolution = 'return'`: card stays at `deck[0]`; `G.pendingHeroChoice` cleared
   - no pending choice: no-op; no mutation
   - wrong player: no-op; pending choice unchanged
   - defensive no-ops (unknown `resolution`, wrong `choiceType`): each a silent no-op; pending choice unchanged
   - discard with card no longer at deck[0]: `moveResult.found = false`; pending cleared anyway
   - `endTurn` move guard: with pending choice set, `endTurn` does not call `events.endTurn()`
     AND does not sweep the hand to discard (guard precedes the sweep)
   - `advanceStage` move guard: at the `cleanup` stage with pending choice set, `advanceStage` does
     not call `events.endTurn()`; `G.currentStage` stays `cleanup` and the pending choice is intact

### Tooling — `apply-hero-ability-markers.mjs`

10. **Extend `VALID_TOKEN_PATTERN`** to accept only the magnitude-bearing form with a positive integer:

    Add `|^\[keyword:reveal-attack-choose:[1-9]\d*\]$` — bare form and `:0` form are invalid.

11. **Add `isRevealAttackChooseCandidate(line)` detection function.**
    A line qualifies IFF ALL of the following are true:
    - `/Reveal the top card of your deck\./i` matches
    - `/\[icon:attack\]/` matches
    - `/equal to (?:its|that card's) cost/i` matches
    - `/Discard it or put it back/i` matches (distinguishes from plain `reveal-cost-attack`)
    - Does NOT contain `'Villain Deck'` or `'Master Strike'`
    - Does NOT contain `'[keyword:reveal-attack-choose'` (idempotence guard)

12. **Add `suggestRevealAttackChooseToken(line)` function.**
    Extracts the cost ceiling from "If it costs N or less" / "costs N or less":
    ```javascript
    function suggestRevealAttackChooseToken(line) {
      const match = line.match(/costs? (\d+) or less/i);
      if (match) return `[keyword:reveal-attack-choose:${match[1]}]`;
      return null; // no ceiling extractable; caller must guard before emitting
    }
    ```

13. **Update `collectProposeRowsForSet()` routing.** Locked order — do not reorder:

    1. `isRevealKoOrDrawCandidate`
    2. `isRevealAttackChooseCandidate` (NEW — must precede `isRevealCostAttackCandidate`)
    3. `isRevealCostAttackCandidate`
    4. `isRevealOddDrawCandidate`
    5. `isRevealKoCandidate`
    6. `isRevealMinCandidate`
    7. `isRevealCandidate`

### Data

14. **Add 1 new entry** to `hero-ability-markers.json`:

    ```json
    "2099": [
      { "heroSlug": "ravage-2099", "cardSlug": "overhorns-and-underhorns",
        "abilityIndex": 0, "markupToken": "[keyword:reveal-attack-choose:4]" }
    ]
    ```

    Run `--propose` BEFORE editing the map to confirm the slug and index.

15. **Apply markup.** `Updated: 1` on first run. Idempotence on second run.

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
- Any engine changes beyond:
  - `packages/game-engine/src/types.ts`
  - `packages/game-engine/src/rules/heroKeywords.ts`
  - `packages/game-engine/src/hero/heroEffects.execute.ts`
  - `packages/game-engine/src/moves/heroChoice.resolve.ts` (new file — move + `ResolveHeroChoiceArgs`)
  - `packages/game-engine/src/game.ts` (import + move registration + `advanceStage` turn-end guard)
  - the `endTurn()` turn-end guard in `packages/game-engine/src/moves/coreMoves.impl.ts`
- `turnLoop.ts` / `turnPhases.logic.ts` are NOT modified — the second guard lives in `game.ts`
  `advanceStage`, not in the shared turn-loop helper (which exposes only `currentStage`).

---

## Files Expected to Change

**Engine (modified):**
1. `packages/game-engine/src/types.ts` — add `PendingHeroChoice` interface + `pendingHeroChoice?` field to `LegendaryGameState`
2. `packages/game-engine/src/rules/heroKeywords.ts` — add `'reveal-attack-choose'`
3. `packages/game-engine/src/hero/heroEffects.execute.ts` — add `reveal-attack-choose` executor case + `MVP_KEYWORDS` entry
4. `packages/game-engine/src/moves/coreMoves.impl.ts` — turn-end guard at the top of `endTurn()` (before the inPlay/hand→discard sweep)

**Engine (new):**
5. `packages/game-engine/src/moves/heroChoice.resolve.ts` — `resolveHeroChoice` move + `ResolveHeroChoiceArgs` payload type

**Engine — move registration + second turn-end guard (modified):**
6. `packages/game-engine/src/game.ts` — import + register `resolveHeroChoice` (`{ move: resolveHeroChoice, client: false }`) + add the `advanceStage` cleanup-stage pending-choice guard

**Engine tests (modified or new):**
7. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — ≥9 new `reveal-attack-choose` cases
8. `packages/game-engine/src/moves/heroChoice.resolve.test.ts` — new file; ≥8 `resolveHeroChoice` + turn-end-guard cases (both `endTurn` and `advanceStage`), co-located with the move
9. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection test 13 → 14

**Tooling (modified):**
10. `scripts/convert-cards/apply-hero-ability-markers.mjs` — extend `VALID_TOKEN_PATTERN`; add `isRevealAttackChooseCandidate`, `suggestRevealAttackChooseToken`; update routing

**Data (modified):**
11. `scripts/convert-cards/inputs/hero-ability-markers.json` — 1 new entry
12. `data/cards/2099.json` — overhorns-and-underhorns abilityIndex=0 markup

**Governance:**
13. `docs/ai/DECISIONS.md` — D-22001..D-22003
14. `docs/ai/STATUS.md` — WP-220 executed
15. `docs/ai/work-packets/WORK_INDEX.md` — WP-220 `[ ]` → `[x]`
16. `docs/ai/execution-checklists/EC_INDEX.md` — EC-252 Draft → Done

16 files. `game.ts` is required for move registration (`resolveHeroChoice` is not callable without it)
and for the `advanceStage` second turn-end guard.

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
- Must be `undefined` at turn-end. BOTH turn-end callsites return silently if it is set:
  `coreMoves.impl.ts:endTurn()` (guard at the top, before the zone sweep) and `game.ts:advanceStage()`
  (guard at the cleanup stage, before delegating to `advanceTurnStage`).

### New Move `resolveHeroChoice` (D-22002)

Signature: `resolveHeroChoice({ G, playerID }: MoveContext, args: ResolveHeroChoiceArgs): void`
(boardgame.io `(context, args)` shape — same as `drawCards`/`playCard`/`endTurn`).

| Payload field | Type | Semantics |
|---|---|---|
| `args.resolution` | `'discard' \| 'return'` | `'discard'`: move card from `deck[0]` to player's `discard`. `'return'`: no mutation; card stays. |

**No-ops (silent return):**
- `args.resolution` is neither `'discard'` nor `'return'`
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
- **D-22002** — `resolveHeroChoice` move: `(context, args)` signature with `ResolveHeroChoiceArgs.resolution`
  (`'discard' | 'return'`), no-op conditions, pending-always-cleared invariant, and turn-end guards at
  BOTH callsites (`coreMoves.impl.ts:endTurn()` and `game.ts:advanceStage()` at cleanup).
- **D-22003** — New `reveal-attack-choose` HeroKeyword: executor peeks deck top,
  conditional attack grant (`cost <= magnitude`), unconditional choice prompt. First card:
  `2099/ravage-2099/overhorns-and-underhorns` with magnitude 4.

---

## Acceptance Criteria

1. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no new failures.
2. `pnpm -r build` exits 0.
3. `HERO_KEYWORDS` array and `HeroKeyword` union both contain `'reveal-attack-choose'`; drift-detection test passes at 14.
4. With cost-2 top card and magnitude 4: executor grants `+2` attack, sets `G.pendingHeroChoice`, leaves card at `deck[0]`.
5. With cost-5 top card and magnitude 4: executor grants no attack, still sets `G.pendingHeroChoice`, leaves card at `deck[0]`.
6. With cost-0 top card and magnitude 4: executor grants `+0` attack and sets `G.pendingHeroChoice`.
7. With empty deck: executor is a silent no-op and does not set `G.pendingHeroChoice`.
8. With missing `cardStats`: executor is a silent no-op and does not set `G.pendingHeroChoice`.
9. With `G.turnEconomy` undefined: executor is a silent no-op and does not set `G.pendingHeroChoice` (turnEconomy guard fires before the pending assignment — ordering is load-bearing).
10. If `G.pendingHeroChoice` is already set: second `reveal-attack-choose` execution is a silent no-op and does not overwrite the original pending choice (reject-second).
11. With undefined magnitude: executor performs no mutation.
12. With magnitude 0: executor performs no mutation.
13. `resolveHeroChoice('discard')` moves the card from deck to discard and clears `G.pendingHeroChoice`.
14. `resolveHeroChoice('return')` leaves the card at `deck[0]` and clears `G.pendingHeroChoice`.
15. `resolveHeroChoice` with no pending choice: silent no-op.
16. `resolveHeroChoice` with wrong `playerID`: silent no-op; pending choice unchanged.
17. `resolveHeroChoice` with wrong `choiceType`: silent no-op.
18. If discard resolution cannot find the card in deck: pending choice is still cleared before return.
19. `endTurn` move with `G.pendingHeroChoice` set: returns silently without calling `events.endTurn()`,
    AND the player's hand is NOT swept to discard (guard precedes the zone sweep).
20. `advanceStage` move at the `cleanup` stage with `G.pendingHeroChoice` set: returns silently without
    calling `events.endTurn()`; `G.currentStage` stays `'cleanup'` and the pending choice is intact.
21. `--propose` includes row: `2099 | ravage-2099 | overhorns-and-underhorns | abilityIndex=0 | … | suggested=[keyword:reveal-attack-choose:4]`.
22. First apply reports `Updated: 1`.
23. Second apply is idempotent and produces no further diff in `data/cards/`.
24. `--validate` exits 0 after apply.
25. `grep "\[keyword:reveal-attack-choose:4\]" data/cards/2099.json | wc -l` returns `1`.
26. `assertValidToken` rejects `[keyword:reveal-attack-choose]` (missing magnitude).
27. `assertValidToken` rejects `[keyword:reveal-attack-choose:0]` (zero magnitude).
28. Existing setup tests continue to pass without requiring default initialization of `G.pendingHeroChoice`.
29. No files outside §Files Expected to Change were modified.
30. D-22001, D-22002, and D-22003 are Active in `docs/ai/DECISIONS.md`.

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
# Expected: exits 0; test count ≥ 1161 (1144 + ≥17 new cases: ≥9 executor + ≥8 move/guard)

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
- [ ] `resolveHeroChoice` move (`(context, args)` signature, `ResolveHeroChoiceArgs.resolution`) with no-op guards and `// why: D-22002` on pending-clear.
- [ ] Turn-end guard at the top of `endTurn()` in `coreMoves.impl.ts` (before the zone sweep) with `// why: D-22002`.
- [ ] Second turn-end guard in `game.ts` `advanceStage()` (cleanup stage) with `// why: D-22002`.
- [ ] `resolveHeroChoice` registered in `game.ts` `moves:` map as `{ move: resolveHeroChoice, client: false }`.
- [ ] ≥17 new tests (≥9 executor + ≥8 resolveHeroChoice/turn-end-guard, covering both `endTurn` and `advanceStage` paths).
- [ ] `VALID_TOKEN_PATTERN` accepts `[keyword:reveal-attack-choose:[1-9]\d*]`; rejects bare form and `:0` form.
- [ ] `isRevealAttackChooseCandidate` has reveal anchor + discard-or-return phrase; routes BEFORE `isRevealCostAttackCandidate`.
- [ ] `hero-ability-markers.json` entry for `2099/ravage-2099/overhorns-and-underhorns`.
- [ ] `data/cards/2099.json` overhorns card marked.
- [ ] `docs/ai/DECISIONS.md` D-22001..D-22003 Active.
- [ ] `docs/ai/STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md` updated.
- [ ] No files outside §Files Expected to Change were modified.

---

## Pre-Flight Report

**Target WP:** WP-220
**EC:** EC-252
**Pre-Flight Date:** 2026-06-06
**Baseline:** `origin/main` @ `dc6df11` (WP-219 governance close; `HERO_KEYWORDS` = 13, tests = 1144)
**Class:** Behavior / State Mutation (adds `G.pendingHeroChoice`; mutates `G.turnEconomy.attack`, `playerZones.deck`, `playerZones.discard`; adds a registered move + two turn-end guards)

### Vision Sanity Check

- **Vision clauses touched:** §22 Deterministic Eval — the executor reads `G.cardStats[topCardId].cost` (setup-time resolved integer); no randomness introduced. §1/§2/§10 content-semantics — one surgical card-data token append.
- **Conflict assertion:** No conflict: this WP preserves all touched clauses.
- **Non-Goal proximity:** N/A — no monetization, competitive, or persuasive surface.
- **Determinism preservation:** Confirmed. All cost comparisons read `G.cardStats[topCardId].cost` (never mutated by executors). No `ctx.random.*`, no wall-clock, no RNG. `G.pendingHeroChoice` is plain serializable state (string discriminant + `CardExtId` + `playerID`). Replay-faithful.
- **`## Vision Alignment` block:** N/A — `00.3 §17.1` triggers do not apply (no scoring, PAR, replay RNG, identity, leaderboard, or monetization surface).

### Dependency & Sequencing Check

| WP | Status | Notes |
|---|---|---|
| WP-219 | ✅ Done 2026-06-06 | commit `dc6df11`; `HERO_KEYWORDS` = 13, tests = 1144, D-21901..D-21903 Active; closes D-21903 item 1 here |

### Dependency Contract Verification

- [x] `moveCardFromZone(from, to, cardId)` — pure helper in `zoneOps.ts`; returns `{from, to, found}`; used by WP-218/219 reveal executors ✅
- [x] `G.cardStats[topCardId].cost` — `CardStatEntry.cost: number`; setup-time populated; read by reveal-cost-attack (WP-219) ✅
- [x] `G.turnEconomy.attack` — mutated by existing `'attack'` executor; `G.turnEconomy` may be undefined; guard required (WP §Assumes) ✅
- [x] `HERO_KEYWORDS` array + `HeroKeyword` union — exists; WP-219 landed both at 13 ✅
- [x] `MVP_KEYWORDS` Set — exists in `heroEffects.execute.ts`; extend with new keyword ✅
- [x] `MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID }` — declared per-file in `coreMoves.impl.ts:23` and `game.ts:67`; the new move file declares the same alias ✅
- [x] `LegendaryGameState.currentStage: TurnStage` — read by the `advanceStage` cleanup guard ✅
- [x] **Turn-end callsite enumeration (verified against source):** there are TWO `events.endTurn()` paths — `coreMoves.impl.ts:endTurn()` (~line 157) and `turnLoop.ts:advanceTurnStage()` (~line 66), the latter reached from `game.ts:advanceStage()` when `getNextTurnStage('cleanup')` returns `null`. Both require a `pendingHeroChoice` guard. `advanceStage` is registered (`game.ts:285`), has no stage gate, and is exposed as "Pass Priority" in `arena-client`. ✅
- [x] No new types cross package boundaries — `PendingHeroChoice` + `ResolveHeroChoiceArgs` are engine-local ✅

### Structural Readiness

All 16 files in §Files Expected to Change exist on disk (or are the one new file `heroChoice.resolve.ts`). `PendingHeroChoice` lives in `types.ts`; `ResolveHeroChoiceArgs` co-locates with the move. No new directories.

### Mutation Boundary Confirmation

- `reveal-attack-choose`: mutates `G.turnEconomy.attack` (conditionally) and sets `G.pendingHeroChoice`; zero zone mutation; `deck[0]` identity preserved
- `resolveHeroChoice('discard')`: `deck` shrinks by 1, `discard` grows by 1 (via `moveResult`); clears `G.pendingHeroChoice`
- `resolveHeroChoice('return')` / no-op paths: clears `G.pendingHeroChoice` only
- Turn-end guards: read-only (`G.pendingHeroChoice`, `G.currentStage`); return without mutation when blocked
- No mutations to `G.piles`, `G.villainDeck`, `G.counters`, `G.hookRegistry`, or other players' zones

### Scope Lock

16 files + EC-252 + this report. Git allowlist is closed. Any file not in §Files Expected to Change is forbidden. `turnLoop.ts` / `turnPhases.logic.ts` are explicitly NOT modified (second guard lives in `game.ts`). `git diff --name-only` checked after completion.

### Test Expectations

| Suite | Before | Expected After | Delta |
|---|---|---|---|
| `game-engine` | 1144 | ≥ 1161 | +≥17 (≥9 executor + ≥8 resolveHeroChoice/turn-end-guard) |

Drift-detection test: expects exactly **14** keywords (was 13).

### Risk Review

- **Turn-end bypass via `advanceStage` (CAUGHT AT DRAFT TIME — resolved):** an earlier draft guarded only the `endTurn` move. Source review confirmed `advanceStage` → `advanceTurnStage` → `events.endTurn()` is a second, unguarded path reachable by real clients ("Pass Priority" at cleanup). Resolved by the dual-guard design (item 7 + item 8). Risk: closed.
- **Move-signature mismatch (CAUGHT AT DRAFT TIME — resolved):** the move snippet originally used a positional `(G, ctx, playerID, resolution)` signature, which boardgame.io 0.50.x would mis-bind. Corrected to `({ G, playerID }: MoveContext, args: ResolveHeroChoiceArgs)`. Risk: closed.
- **Guard placement in `endTurn`:** guard must precede the inPlay/hand→discard sweep, else a blocked turn discards the hand. Locked in §Assumes + item 8 + AC-19. Risk: low.
- **`G.turnEconomy` guard ordering:** `G.pendingHeroChoice` is set AFTER the `turnEconomy` guard; if undefined, the choice is not set (AC-9). Risk: documentation clarity only; covered.
- **`exactOptionalPropertyTypes`:** `pendingHeroChoice?: PendingHeroChoice` with `undefined` absent-value matches the existing optional-field convention (`villainRevealedThisTurn?`). Risk: low.

### Verdict

**READY TO EXECUTE**

All dependencies met. Both turn-end callsites enumerated against source and guarded. Move signature conforms to the framework. Scope locked at 16 files. Test delta quantified (≥1161). Two design risks surfaced and resolved at draft time; no blocking risks remain.

---

## Copilot Check

**Date:** 2026-06-06
**Pre-flight verdict under review:** READY TO EXECUTE (2026-06-06)
**WP class:** Behavior / State Mutation — copilot check is mandatory.
**Inputs reviewed:** EC-252, WP-220, the Pre-Flight Report above.

### Overall Judgment

**PASS**

Pre-flight READY verdict stands. WP-220 is scoped to 16 files and introduces the project's first player-choice infrastructure (`G.pendingHeroChoice` + `resolveHeroChoice` + two turn-end guards). The two highest-risk failure modes — turn-end bypass via `advanceStage` (issue 18) and a non-conforming move signature (issue 21) — were surfaced and resolved at draft time, by construction, before any code exists. All 30 issues scanned; the non-PASS items below are RISKs already mitigated in the WP/EC text, none requiring scope change.

### Findings (non-PASS items only)

**5. [RISK→mitigated] Optional Field Ambiguity** — `pendingHeroChoice?: PendingHeroChoice` under `exactOptionalPropertyTypes`. FIX (in WP): absent-value locked to `undefined` (never `null`), matching `villainRevealedThisTurn?`; AC-28 asserts setup does not default-initialize it. Scope-neutral; already in WP.

**6. [RISK→mitigated] Undefined Merge Semantics (reject vs overwrite)** — a second `reveal-attack-choose` while a choice is pending. FIX (in WP): reject-second locked (silent no-op, no overwrite) in the executor, §Contract, D-22001, and AC-10. No emergent behavior.

**18. [RISK→mitigated] Outcome Evaluation Timing (turn-end bypass)** — the turn ends through two callsites; guarding only `endTurn` would let `advanceStage` end the turn with a pending choice. FIX (in WP): dual guard (`endTurn` top-of-body + `advanceStage` cleanup), enumerated in the Pre-Flight Dependency Contract Verification against source, with AC-19 + AC-20 and tests for both paths.

**22. [RISK→mitigated] Silent vs Loud Failure** — the move + executor have many no-op paths. FIX (in WP): all no-op conditions enumerated explicitly (executor: 7 guards; move: 4 guards incl. unknown-resolution); "moves never throw" honored; full-sentence intent in `// why:` comments.

All other 26 issues: PASS. Notable strong points:
- Issue 1/16 (lifecycle wiring): `game.ts` edits (registration + `advanceStage` guard) are explicitly allowlisted; no helper leaks into the engine.
- Issue 4 (contract drift): `HERO_KEYWORDS` array + union updated atomically; drift test asserts exactly 14.
- Issue 10/21 (stringly-typed / type widening): `choiceType: 'discard-or-return'` discriminant; `ResolveHeroChoiceArgs.resolution` union; `CardExtId` for card identity.
- Issue 15 (why-comments): required on both turn-end guards and the pending-clear line.

### Mandatory Governance Follow-ups

- DECISIONS.md: D-22001, D-22002, D-22003 — drafted 2026-06-06; land at execution.

### Pre-Flight Verdict Disposition

- [x] CONFIRM — Pre-flight READY TO EXECUTE verdict stands. Session prompt generation authorized.

---

## Lint Gate Self-Review

**Date:** 2026-06-06 | **Verdict: PASS** (all applicable sections resolved)

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Work Packet Structure | PASS | All required sections present and non-empty: Goal, Assumes, Context (Read First), Scope (In), Out of Scope, Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done |
| §2 | Non-Negotiable Constraints | PASS | Engine/Tooling/Data/Locked-Contract subsections; no `.reduce()` in zone ops; zoneOps helpers; HERO_KEYWORDS parity; ESM/Node v22; no `@legendary-arena` imports in tooling; `00.6-code-style.md` referenced in Context item 13 (matches WP-219 house style) |
| §3 | Prerequisites | PASS | WP-219 listed with commit `dc6df11`; baseline 1144 tests cited; `G.turnEconomy`/`moveCardFromZone`/`MoveContext` dependencies grounded; both turn-end callsites named |
| §4 | Context References | PASS | 14 context items incl. `coreMoves.impl.ts`, `game.ts`, `turnLoop.ts`/`turnPhases.logic.ts`, `00.6-code-style.md`, `ARCHITECTURE.md` |
| §5 | Output Completeness | PASS | 16 files, each `new`/`modified` with a one-line change description; single authoritative count; no ambiguous output language |
| §6 | Naming Consistency | PASS | `reveal-attack-choose`, `pendingHeroChoice`, `PendingHeroChoice`, `resolveHeroChoice`, `ResolveHeroChoiceArgs`, `choiceType: 'discard-or-return'` consistent throughout; `CardExtId` used for card identity |
| §7 | Dependency Discipline | PASS | No new npm deps; existing `moveCardFromZone`/`zoneOps.ts` only |
| §8 | Architectural Boundaries | PASS | Engine changes in `packages/game-engine` only; tooling in `scripts/convert-cards/`; data in `data/cards/`; no cross-layer imports; `G` runtime-only; moves never throw |
| §9 | Windows Compatibility | N/A | Node built-ins only; no Windows-specific paths or APIs |
| §10 | Environment Variable Hygiene | N/A | No env vars touched |
| §11 | Authentication Clarity | N/A | No auth surface touched |
| §12 | Test Quality | PASS | ≥17 `node:test` cases via `makeMockCtx`; branches include reject-second, turnEconomy-undefined ordering, empty-deck, missing-stats, both turn-end guards (endTurn + advanceStage), discard-not-found pending-clear |
| §13 | Commands and Verification | PASS | Exact `pnpm`/`node` commands with expected output; test delta updated to ≥1161 |
| §14 | Acceptance Criteria Quality | PASS | 30 items; all binary and observable; count exceeds the 6–12 guideline but established precedent per WP-219 (26 ACs) and WP-218 (24 ACs); each item is a distinct code path (no fold candidates) |
| §15 | Definition of Done | PASS | DECISIONS.md, STATUS.md, WORK_INDEX.md, EC_INDEX.md all listed; scope-boundary check present |
| §16 | Code Style | PASS | `// why:` on both turn-end guards + pending-clear + reject-second; named-export imports; full-sentence intent; descriptive names; no `.reduce()`; functions small; move follows validate→guard→mutate→return |
| §17 | Vision Alignment | N/A | Engine + offline-tooling + card-data add of one executor keyword (`reveal-attack-choose`), one optional G field (`G.pendingHeroChoice`), one move (`resolveHeroChoice`), two turn-end guards, and one surgical card-data token append. No scoring, PAR, replay, RNG sourcing change, identity, leaderboard, multiplayer-sync, accessibility, or Registry-Viewer surface touched. Determinism preserved: executor reads `G.cardStats[topCardId].cost` (setup-time integer, never mutated); no `ctx.random.*`/wall-clock; `G.pendingHeroChoice` is plain serializable state. No `## Vision Alignment` block required. |
| §18 | Prose-vs-Grep Discipline | N/A | Verification-Step greps target card-data tokens only (`reveal-attack-choose` / `overhorns`); no forbidden-token literal grep, no adjacent forbidden-token prose; no D-entry citation required |
| §19 | Bridge-vs-HEAD Staleness | PASS | Baseline `dc6df11` (WP-219) cited; HERO_KEYWORDS count of 13 quoted for pre-execution verification; reconciled against `origin/main` at draft commit time |
| §20 | Funding Surface Gate | N/A | No monetization, supporter-tier, donate/funding copy, or paid surface touched; engine + offline-tooling + card-data only |
| §21 | API Endpoints Catalog | N/A | No HTTP endpoint added/modified/removed and no `apps/server/src/**` `Library-only` function touched. `resolveHeroChoice` is a boardgame.io move registered in `packages/game-engine/src/game.ts` (invoked via the boardgame.io transport, not a `router.<verb>()` / `register*Routes()` surface), so `api-endpoints.md` needs no row. |
