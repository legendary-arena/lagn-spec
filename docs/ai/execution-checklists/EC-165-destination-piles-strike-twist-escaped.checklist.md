# EC-165 — Destination Piles: Strike, Twist, and Escaped Villain (Execution Checklist)

**Source:** docs/ai/work-packets/WP-153-destination-piles-strike-twist-escaped.md
**Layer:** Game Engine (`packages/game-engine/src/`) — types, setup, reveal pipeline, UI projection, replay hash
**EC retarget breadcrumb:** EC-153 taken by WP-149 (Public Leaderboard Marketing Page). WP number (WP-153) unchanged.

## Before Starting
- [ ] WP-128 + WP-135 complete on `main` (projection extensions + graduation template)
- [ ] Confirm `uiState.build.ts` contains 8 `// SAFE-SKIP-WP128` matches (1 docstring + 7 code markers; 3 graduate here)
- [ ] Confirm `villainDeck.reveal.ts` routes scheme-twist and mastermind-strike to `G.villainDeck.discard` (pre-WP lines ~256-259)
- [ ] Confirm `city.logic.ts` exports `pushVillainIntoCity` returning `escapedCard: CardExtId | null`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0 and `test` exits 0; record baseline counts

## Locked Values (do not re-derive)
- `G.mastermind.strikePile: CardExtId[]` — on `MastermindState`
- `G.scheme.twistPile: CardExtId[]` — `G.scheme` is a NEW `SchemeState`
  object `{ twistPile: CardExtId[] }`; `G.schemeSetupInstructions` stays
  top-level unchanged
- `G.escapedPile: CardExtId[]` — top-level on G (CityZone is a fixed
  5-tuple; cannot host named fields)
- `UIDisplayEntry` shape: `{ extId: string; display: UICardDisplay }` — locked by WP-128
- `REVEALED_CARD_TYPES`: `'villain' | 'henchman' | 'bystander' | 'scheme-twist' | 'mastermind-strike'` — not modified
- `ENDGAME_CONDITIONS.ESCAPED_VILLAINS` counter key — unchanged
- `resolveDisplay` per WP-111 D-11105 aliasing-defense (per-entry shallow copy)
- Pile suffix: `Pile` — no `Deck`, `Zone`, or `Collection` alternatives
- All piles append-only, `array.push`, chronological order, no sorting/reordering

## Guardrails
- `'scheme-twist'` cards → `G.scheme.twistPile` ONLY; MUST NOT go to `G.villainDeck.discard`
- `'mastermind-strike'` cards → `G.mastermind.strikePile` ONLY; MUST NOT go to `G.villainDeck.discard`
- Escaped villains → `G.escapedPile` only if `escapedCard !== null`; counter increment regardless of null state
- All three piles MUST exist on G at setup (`G.mastermind.strikePile = []`, `G.scheme = { twistPile: [] }`, `G.escapedPile = []`) — absence is hard failure
- Projections preserve G array order 1:1 — no filtering, sorting, or transformation beyond mapping
- No `.reduce()` in zone operations or effect application
- No `boardgame.io` imports in pure helpers
- Destination piles (`G.mastermind.strikePile`, `G.scheme.twistPile`, `G.escapedPile`) MUST only be mutated in `revealVillainCard` — no other function may push
- `REVEALED_CARD_TYPES` array NOT modified — no new card types

## Required `// why:` Comments
- Each pile field declaration (`strikePile`, `twistPile`, `escapedPile`): append-only, order significance, no reshuffle (MVP)
- `revealVillainCard` routing changes: explain diversion from discard to destination pile
- `G.escapedPile` push site: explain null guard + counter-increment-regardless contract
- 01.5 replay hash literal: explain new G fields changing hash

## Files to Produce
- `packages/game-engine/src/mastermind/mastermind.types.ts` — **modified** — add `strikePile: CardExtId[]`
- `packages/game-engine/src/types.ts` — **modified** — add scheme + escaped pile G fields
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — init 3 piles as `[]`
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** — route cards to new piles
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — graduate 3 safe-skip projections
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — real projection assertions
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` — **modified** — routing + ordering tests
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified** — hash literal update
- `docs/ai/DECISIONS.md` — **modified** — D-153xx entries
- `docs/ai/STATUS.md` — **modified** — dated completion
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-153

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] Zero scheme-twist / mastermind-strike cards in `G.villainDeck.discard` after routing (test-verified)
- [ ] Destination piles preserve insertion order (multi-reveal test)
- [ ] Escaped pile contains only non-null `CardExtId` values (null-guard test)
- [ ] Projection arrays match G arrays 1:1; entries are fresh object instances
- [ ] `computeStateHash` changes when any destination pile changes (01.5 cascade resolved)
- [ ] No function outside `revealVillainCard` mutates destination piles
- [ ] `rg "SAFE-SKIP-WP128" packages/game-engine/src/ui/uiState.build.ts --count` returns 5 (1 docstring + 4 code markers)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-153xx: locked G field placement rationale)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-165 → Done
- [ ] No files outside the "Files to Produce" list were modified

## Common Failure Smells (Optional)
- Cards appear in both discard and destination pile → duplicate routing (double-write bug; old discard push still active)
- Escaped pile contains `null` entries → missing null guard on `escapedCard` before push
- Projection order doesn't match G order → sort or filter applied in `uiState.build.ts` mapping
- Replay hash unchanged after adding piles → `computeStateHash` not reading new G fields
- Setup tests fail on missing field → pile not initialized in `buildInitialGameState`
- `SAFE-SKIP-WP128` count is not 5 → wrong number of markers graduated (expected exactly 3 removed from 8)
- Destination pile order differs between runs with same seed → non-deterministic mutation introduced
