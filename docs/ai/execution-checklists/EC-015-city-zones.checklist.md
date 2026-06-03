# EC-015 — City & HQ Zones (Execution Checklist)

**Source:** docs/ai/work-packets/WP-015-city-hq-zones-villain-movement.md
**Layer:** Game Engine / Board Zones

**Execution Authority:**
This EC is the authoritative execution checklist for WP-015.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-015.

---

## Before Starting

- [ ] WP-014 complete: `revealVillainCard`, `G.villainDeckCardTypes` exist
- [ ] `ENDGAME_CONDITIONS.ESCAPED_VILLAINS` exists in `endgame.types.ts` (WP-010)
- [ ] `executeRuleHooks`, `applyRuleEffects` exist (WP-009B)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

---

## Locked Values (do not re-derive)

All items below must be copied verbatim from WP-015.
If formatting, spelling, or ordering differs, the implementation is invalid.

- `CityZone = [CitySpace, CitySpace, CitySpace, CitySpace, CitySpace]` -- fixed 5-tuple
- `CitySpace = CardExtId | null`
- `HqZone = [HqSlot, HqSlot, HqSlot, HqSlot, HqSlot]` -- fixed 5-tuple
- `HqSlot = CardExtId | null`
- `ENDGAME_CONDITIONS.ESCAPED_VILLAINS = 'escapedVillains'`
- City routing rules:
  `'villain'` and `'henchman'` -> enter City (push logic)
  `'scheme-twist'` -> trigger only (WP-014 existing)
  `'mastermind-strike'` -> trigger only (WP-014 existing)
  `'bystander'` -> discard + message (MVP; no capture rules yet)
- City space indexing: 0-based; space 0 = entry, space 4 = escape edge

---

## Guardrails

- `pushVillainIntoCity` is a pure helper -- no boardgame.io import in `city.logic.ts`
- Escape counter uses `ENDGAME_CONDITIONS.ESCAPED_VILLAINS` constant -- never string literal
- No `.reduce()` in city push logic -- explicit assignment
- WP-014 contract files (`villainDeck.types.ts`) must NOT be modified
- HQ initialized but not used for buying -- WP-016 adds recruit logic
- Bystander MVP: revealed bystanders go to discard (existing WP-014 behavior)
- City placement occurs BEFORE trigger emission -- rule hooks observe
  post-placement board state (matching Legendary tabletop semantics).
  Violation of this ordering is a breaking change requiring DECISIONS.md entry.
- City mutation in WP-015 occurs only during `revealVillainCard`. No other
  helper, move, or test may mutate `G.city` directly.
- **Push absorbs the cascade at the leftmost empty space (per D-1504).**
  Only the contiguous entry-side block advances on each push; cards in
  spaces past the leftmost empty space (including a card on space 4) do
  NOT advance. A card escapes from space 4 only when every space is
  occupied at push time. Implementations that shift every space uniformly
  on every push are wrong — only villains push, empty spaces don't.
  Supersedes any prose in WP-015 §B or this EC's earlier revisions that
  implied uniform shift.

---

## Required `// why:` Comments

- 5-tuple design: fixed size enforces board layout at type level
- Push shift direction: rightward = toward escape
- Bystander MVP decision: capture rules are WP-017; MVP discards
- HQ empty at init: recruit slot population is WP-016 scope

---

## Files to Produce

- `src/board/city.types.ts` -- **new** -- `CityZone`, `HqZone`, `CitySpace`, `HqSlot`
- `src/board/city.logic.ts` -- **new** -- `pushVillainIntoCity`, `initializeCity`, `initializeHq`
- `src/board/city.validate.ts` -- **new** -- `validateCityShape`
- `src/setup/buildInitialGameState.ts` -- **modified** -- initialize `G.city` and `G.hq`
- `src/villainDeck/villainDeck.reveal.ts` -- **modified** -- route villains/henchmen to City
- `src/types.ts` -- **modified** -- add `city: CityZone`, `hq: HqZone`
- `src/index.ts` -- **modified** -- export new public API
- `src/board/city.logic.test.ts` -- **new** -- 7 city push unit tests
- `src/villainDeck/villainDeck.city.integration.test.ts` -- **new** -- 8 integration tests

---

## Common Failure Smells (Optional)

- City uses variable-length array instead of 5-tuple
  -> type-level board layout enforcement lost
- Escape counter uses string literal `'escapedVillains'` instead of constant
  -> endgame evaluator will not detect escapes
- `villainDeck.types.ts` modified
  -> WP-014 contract violation
- Trigger emission occurs before City placement
  -> ordering contract violation; hooks must observe post-placement state
- City mutated outside `revealVillainCard`
  -> only the reveal move may mutate G.city in WP-015
- **Push shifts every space uniformly regardless of empty slots
  (e.g., `newCity = [cardId, city[0], city[1], city[2], city[3]]`
  unconditionally; `escapedCard = city[4]` regardless of gaps)**
  -> the bug fixed by D-1504. Symptom: a villain on space 4 escapes on
  every reveal even when one or more spaces between it and the entry-side
  block are empty. Correct behavior: locate the leftmost empty space; only
  the contiguous block from space 0 up to that space advances; spaces past
  the empty slot are untouched; escape fires only when every space is
  occupied at push time. A test fixture of `[A, _, _, _, B]` + push must
  produce `[N, A, _, _, B]` with `escapedCard = null`, not
  `[N, A, _, _, _]` with `escapedCard = B`.

---

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] No boardgame.io import in `city.logic.ts`
- [ ] Escape uses `ENDGAME_CONDITIONS` constant (not string literal)
- [ ] `villainDeck.types.ts` was NOT modified (`git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated (City and HQ zones exist; villain movement and escapes work)
- [ ] `docs/ai/DECISIONS.md` updated (bystander MVP discard; 5-tuple over variable-length; push at space 0)
- [ ] `docs/ai/ARCHITECTURE.md` updated (`G.city` and `G.hq` in Field Classification table)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-015 checked off with date
