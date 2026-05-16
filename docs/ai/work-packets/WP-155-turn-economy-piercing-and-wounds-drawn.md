# WP-155 — Turn Economy Extensions: Piercing and Wounds Drawn

## Goal

Graduate two WP-128 safe-skip sites (`economy.piercing`,
`economy.woundsDrawn`) by adding `piercing` and `woundsDrawn` fields to
`TurnEconomy` and wiring the move logic that populates them. Removes two
`// SAFE-SKIP-WP128` markers from `uiState.build.ts` and replaces their
hardcoded `0` with real projections from `G.turnEconomy`.

## Assumes

- WP-128 (UIState Projection Extensions for Board Layout) is complete.
  `uiState.build.ts` contains the `// SAFE-SKIP-WP128` markers at the
  `piercing` and `woundsDrawn` assignment sites. `uiState.types.ts`
  defines `UITurnEconomyState.piercing: number` and
  `UITurnEconomyState.woundsDrawn: number`.
- WP-135 (HQ Population & Hero Deck Reservoir) is complete — graduation
  template pattern.
- WP-018 (Turn Economy) is complete. `TurnEconomy` in
  `economy.types.ts` has `attack`, `recruit`, `spentAttack`,
  `spentRecruit`. Per-turn reset to all zeros happens at turn start.
- The `gainWound` helper exists and is called from the escape handler
  in `villainDeck.reveal.ts` and potentially other sites. The helper
  moves a wound from `G.piles.wounds` to a player's discard.

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary — game-engine layer rules
- `docs/ai/DECISIONS.md` — D-12806 (safe-skip resolution)
- `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md`
  — graduation template pattern
- `docs/ai/work-packets/WP-128-uistate-projection-extensions-for-board-layout.md`
  §Scope B Safe-Skip Resolutions — `economy.piercing` and
  `economy.woundsDrawn` rows
- `packages/game-engine/src/economy/economy.types.ts` — current
  `TurnEconomy` shape
- `.claude/rules/game-engine.md` — move validation contract, zone rules
- `.claude/rules/code-style.md` — naming, comments, function size

## Scope (In)

- Add `piercing: number` field to `TurnEconomy` in `economy.types.ts`
- Add `woundsDrawn: number` field to `TurnEconomy` in `economy.types.ts`
- Update per-turn reset logic to initialize both new fields to `0`
- Wire `piercing` tracking: when a hero card with piercing is played
  (or when a piercing effect fires), increment
  `G.turnEconomy.piercing`. MVP: field is tracked but no hero cards
  currently produce piercing — the field exists for the projection
  contract and future hero ability WPs
- Wire `woundsDrawn` tracking: every time the current player gains a
  wound during their turn, increment `G.turnEconomy.woundsDrawn`. The
  existing `gainWound` call sites (escape handler, Ambush handler) are
  the increment points
- Graduate two `uiState.build.ts` projections: replace hardcoded `0`
  with `gameState.turnEconomy.piercing` and
  `gameState.turnEconomy.woundsDrawn`, remove two
  `// SAFE-SKIP-WP128` markers
- Add/update tests for the new fields, per-turn reset, wound tracking,
  and projections
- 01.5 cascade: update `computeStateHash` replay fixture literal
- DECISIONS.md entries

## Out of Scope

- Implementing hero cards that produce piercing (future hero ability
  WPs) — the field is added and tracked but no producer exists in MVP
- Changing the `gainWound` helper signature (woundsDrawn is tracked at
  the call site, not inside the helper)
- Master Strike bystander captures — that is WP-154 scope
- Destination piles — that is WP-153 scope
- Horrors pile — that is WP-156 scope
- Any UI or client-side rendering changes
- Adding `piercing` to `CardStatEntry` or the registry (future WP)

## Files Expected to Change

- `packages/game-engine/src/economy/economy.types.ts` — modified — add
  `piercing: number` and `woundsDrawn: number` to `TurnEconomy`
- `packages/game-engine/src/setup/buildInitialGameState.ts` (or
  equivalent economy-reset site) — modified — initialize new fields to
  `0` and include in per-turn reset
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
  modified — increment `G.turnEconomy.woundsDrawn` at each `gainWound`
  call site
- `packages/game-engine/src/ui/uiState.build.ts` — modified — graduate
  two safe-skip sites with real projections
- `packages/game-engine/src/ui/uiState.build.test.ts` — modified — flip
  safe-skip value assertions to real projected values
- `packages/game-engine/src/economy/economy.integration.test.ts` —
  modified — update mock factory for new `TurnEconomy` fields
- `packages/game-engine/src/replay/replay.execute.test.ts` — modified —
  update hash literal (01.5 cascade)
- `docs/ai/DECISIONS.md` — modified — D-155xx entries
- `docs/ai/STATUS.md` — modified — dated completion entry
- `docs/ai/work-packets/WORK_INDEX.md` — modified — check off WP-155

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Full file contents for every new or modified file — no diffs, no snippets
- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- All randomness via `ctx.random.*` — never `Math.random()`
- `G` must remain JSON-serializable at all times
- Moves never throw — only `Game.setup()` may throw
- All zones store `CardExtId` strings only
- No `.reduce()` in zone operations or effect application
- No `boardgame.io` imports in pure helpers
- Every `ctx.events.setPhase()` and `ctx.events.endTurn()` call needs a
  `// why:` comment

**Packet-specific:**
- `piercing` and `woundsDrawn` are `number` (integers >= 0), consistent
  with existing `TurnEconomy` field types
- Both fields reset to `0` at the start of each player turn, alongside
  existing economy fields
- `woundsDrawn` is incremented at every `gainWound` call site during
  the current player's turn — the helper itself is NOT modified
- `piercing` is initialized and reset but has no producer in MVP — the
  field value will be `0` in all current gameplay until a future hero
  ability WP adds piercing-producing cards
- 01.5 IS INVOKED — new G fields change `computeStateHash`

**Session protocol:**
- Stop and ask on unclear items — never guess
- If wound-tracking call sites are ambiguous, enumerate them before
  implementing

**Locked contract values:**
- `UITurnEconomyState.piercing: number` — locked by WP-128
- `UITurnEconomyState.woundsDrawn: number` — locked by WP-128
- Existing `TurnEconomy` fields (`attack`, `recruit`, `spentAttack`,
  `spentRecruit`) — unchanged

## Acceptance Criteria

- [ ] `TurnEconomy` in `economy.types.ts` has `piercing: number` and `woundsDrawn: number` fields
- [ ] Both new fields initialized to `0` in `Game.setup()`
- [ ] Both new fields reset to `0` at start of each player turn
- [ ] `G.turnEconomy.woundsDrawn` incremented at each `gainWound` call site during player's turn
- [ ] `G.turnEconomy.piercing` initialized and reset but no producer in MVP (always `0` in current gameplay)
- [ ] `uiState.build.ts` projects `economy.piercing` from `gameState.turnEconomy.piercing`
- [ ] `uiState.build.ts` projects `economy.woundsDrawn` from `gameState.turnEconomy.woundsDrawn`
- [ ] Two `// SAFE-SKIP-WP128` markers removed from `uiState.build.ts`
- [ ] `pnpm --filter game-engine test` passes with no failures

## Vision Alignment

**Vision clauses touched:** §3 (determinism), §22 (replay faithfulness).

No conflict: this WP preserves all touched clauses. Economy field
updates are deterministic (increment on wound gain, which is a
deterministic event). Replay faithfulness maintained via 01.5 cascade.

**Non-Goal proximity check:** NG-1..7 not crossed.

**Determinism preservation:** wound-draw count is a deterministic
accumulator. Piercing is `0` in MVP (no producer). No new randomness.

## Funding Surface Gate

N/A — engine-only G-state extension; no UI surfaces, no user-visible
copy, no funding channels referenced.

## API Catalog (§21)

N/A — no HTTP endpoints touched, no `apps/server/src/**` library
functions added or modified.

## Verification Steps

```pwsh
pnpm --filter game-engine test
# Expected: all tests pass, no failures

# Verify safe-skip markers reduced by 2
rg "SAFE-SKIP-WP128" packages/game-engine/src/ui/uiState.build.ts --count
# Expected: count reduced by 2 from pre-WP-155 baseline
```

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-155xx entries
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-155 checked off
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 cascade resolved — replay hash literal updated with `// why:` comment
