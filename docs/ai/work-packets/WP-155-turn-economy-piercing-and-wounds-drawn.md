# WP-155 — Turn Economy Extensions: Piercing and Wounds Drawn

## Goal

Graduate two WP-128 safe-skip sites (`economy.piercing`,
`economy.woundsDrawn`) by adding `piercing` and `woundsDrawn` fields to
`TurnEconomy` and wiring deterministic state updates that populate them.
Removes two `// SAFE-SKIP-WP128` markers from `uiState.build.ts` and
replaces their hardcoded `0` with real projections from `G.turnEconomy`.

## Assumes

- **Baseline:** `origin/main` at `bef03a82` (2026-05-16)
- WP-128 (UIState Projection Extensions for Board Layout) is complete.
  `uiState.build.ts` contains the `// SAFE-SKIP-WP128` markers at the
  `piercing` and `woundsDrawn` assignment sites (lines 480–481).
  `uiState.types.ts` defines `UITurnEconomyState.piercing: number` and
  `UITurnEconomyState.woundsDrawn: number`.
- WP-135 (HQ Population & Hero Deck Reservoir) is complete — graduation
  template pattern.
- WP-018 (Turn Economy) is complete. `TurnEconomy` in
  `economy.types.ts` has `attack`, `recruit`, `spentAttack`,
  `spentRecruit`. Per-turn reset to all zeros happens via
  `resetTurnEconomy()` in `economy.logic.ts`.
- The `gainWound` helper exists in `board/wounds.logic.ts` and is called
  from two sites in `villainDeck.reveal.ts`:
  1. Escape handler (~line 134) — current player gains a wound
  2. Ambush handler (~line 173) — each player gains a wound

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
- `packages/game-engine/src/economy/economy.logic.ts` —
  `resetTurnEconomy()` function (line 529)
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
  `gainWound` call sites
- `.claude/rules/game-engine.md` — move validation contract, zone rules
- `.claude/rules/code-style.md` — naming, comments, function size

## Scope (In)

- Add `piercing: number` field to `TurnEconomy` in `economy.types.ts`
- Add `woundsDrawn: number` field to `TurnEconomy` in `economy.types.ts`
- Update `resetTurnEconomy()` in `economy.logic.ts` to return both new
  fields initialized to `0`
- Wire `piercing` tracking: MVP — field exists for the projection
  contract but no hero cards currently produce piercing. The field
  remains `0` in all current gameplay until a future hero ability WP
  adds piercing-producing cards
- Wire `woundsDrawn` tracking: increment `G.turnEconomy.woundsDrawn`
  every time the **current player** gains a wound during their turn.
  Specifically:
  - Escape handler: always increments (escape wounds go to current
    player)
  - Ambush handler: increment only for the current player's wound
    (`playerId === ctx.currentPlayer`), not for other players' wounds
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
- Tracking wounds gained by non-current players during the turn (Ambush
  gives all players wounds; only the current player's wound counts
  toward `woundsDrawn`)

## Files Expected to Change

- `packages/game-engine/src/economy/economy.types.ts` — modified — add
  `piercing: number` and `woundsDrawn: number` to `TurnEconomy`
- `packages/game-engine/src/economy/economy.logic.ts` — modified —
  update `resetTurnEconomy()` to include `piercing: 0, woundsDrawn: 0`
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
  modified — increment `G.turnEconomy.woundsDrawn` at escape and
  Ambush (current player only) call sites
- `packages/game-engine/src/ui/uiState.build.ts` — modified — graduate
  two safe-skip sites with real projections
- `packages/game-engine/src/ui/uiState.build.test.ts` — modified — flip
  safe-skip value assertions to real projected values
- `packages/game-engine/src/economy/economy.logic.test.ts` — modified —
  test `resetTurnEconomy` returns new fields
- `packages/game-engine/src/economy/economy.integration.test.ts` —
  modified — update mock factory for new `TurnEconomy` fields
- `packages/game-engine/src/replay/replay.execute.test.ts` — modified —
  update hash literal (01.5 cascade)
- `docs/ai/DECISIONS.md` — modified — D-155xx entries
- `docs/ai/STATUS.md` — modified — dated completion entry
- `docs/ai/work-packets/WORK_INDEX.md` — modified — check off WP-155

## Contract

This WP locks the following data surface:

- `TurnEconomy` gains two new fields: `piercing: number` and
  `woundsDrawn: number`. Both are integers >= 0, reset to `0` per turn.
- `resetTurnEconomy()` return shape expands from 4 fields to 6 fields.
  All existing callers (game.ts onBegin, buildInitialGameState,
  simulation runners) receive both new fields automatically.
- `UITurnEconomyState.piercing` and `UITurnEconomyState.woundsDrawn`
  projections switch from hardcoded `0` to live `G.turnEconomy` reads.
  No UI contract change — the types were already locked by WP-128.
- `gainWound` helper signature is unchanged. Wound accounting is
  performed at call sites, not inside the helper.

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
  existing economy fields (via `resetTurnEconomy()`)
- `woundsDrawn` tracks wounds gained by the **current player only**
  during their turn — Ambush wounds dealt to other players do NOT
  increment this counter
- `woundsDrawn` is incremented at the `gainWound` call site, not inside
  the `gainWound` helper — the helper itself is NOT modified
- `G.turnEconomy.piercing` MUST NOT be incremented anywhere in this WP.
  Any increment logic for piercing is out-of-scope and must be
  introduced in a future WP
- 01.5 IS INVOKED — new G fields change `computeStateHash`

**Canonical Rule — Wound Accounting:**
- A "wound drawn" is defined as: a wound card moved from
  `G.piles.wounds` into the current player's ownership (discard, hand,
  or other zone)
- Increment MUST occur exactly once per such transfer
- If multiple wounds are gained in a single effect, increment once per
  wound (not per call site invocation)
- Increment MUST occur immediately adjacent to the wound transfer logic
  at the site performing the move
- Do NOT increment in wrappers or non-owning callers

**01.5 Cascade Constraint:**
- Replay hash changes MUST be attributable ONLY to the addition of
  `turnEconomy.piercing` and `turnEconomy.woundsDrawn`
- No behavioral or sequencing changes are permitted
- Hash update must include `// why:` comment documenting this exact cause

**Pre-Implementation Requirement (Blocking):**
- Confirm that the ONLY `gainWound` call sites affecting the current
  player are:
  1. Escape handler (~line 134)
  2. Ambush handler (~line 173)
- If any additional call sites exist that can affect the current player:
  - STOP
  - Enumerate them
  - Extend Scope and Acceptance Criteria before implementation

**Naming justification:**
- `woundsDrawn` is named for UI/stat projection alignment
  (player-facing terminology), not engine semantics (`gained`)

**Locked contract values:**
- `UITurnEconomyState.piercing: number` — locked by WP-128
- `UITurnEconomyState.woundsDrawn: number` — locked by WP-128
- Existing `TurnEconomy` fields (`attack`, `recruit`, `spentAttack`,
  `spentRecruit`) — unchanged
- `resetTurnEconomy()` return shape must include all 6 fields after this WP

## Acceptance Criteria

- [ ] `TurnEconomy` in `economy.types.ts` has `piercing: number` and `woundsDrawn: number` fields
- [ ] `resetTurnEconomy()` returns all 6 fields (including `piercing: 0, woundsDrawn: 0`)
- [ ] Both new fields reset to `0` at start of each player turn (via existing `resetTurnEconomy()` call in `game.ts`)
- [ ] `G.turnEconomy.woundsDrawn` incremented at escape handler (current player wound)
- [ ] `G.turnEconomy.woundsDrawn` incremented at Ambush handler only for current player (`playerId === ctx.currentPlayer`)
- [ ] `G.turnEconomy.piercing` initialized and reset but no producer in MVP (always `0` in current gameplay); no increment statement exists anywhere
- [ ] Multiple wound gains in a single effect increment `woundsDrawn` per wound (not per handler invocation)
- [ ] After `ctx.events.endTurn()`, next player's `woundsDrawn === 0` (reset verified in test)
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
accumulator scoped to current player. Piercing is `0` in MVP (no
producer). No new randomness.

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
# Expected: count reduced by 2 from pre-WP-155 baseline (1 remaining: horrorsCount)
```

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-155xx entries
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-155 checked off
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 cascade resolved — replay hash literal updated with `// why:` comment

## Lint Gate Self-Review

| § | Verdict | Notes |
|---|---|---|
| 1 | PASS | All required sections present |
| 2 | PASS | Engine-wide + packet-specific constraints; full-file output required; references 00.6 |
| 3 | PASS | WP-128, WP-135, WP-018 dependencies listed; file shapes enumerated |
| 4 | PASS | ARCHITECTURE.md, DECISIONS.md, economy.types.ts, economy.logic.ts, reveal.ts, rules files cited |
| 5 | PASS | 11 files listed with new/modified annotations and descriptions |
| 6 | N/A | No new naming conflicts; fields match existing TurnEconomy pattern |
| 7 | N/A | No new npm dependencies |
| 8 | PASS | Engine-only; no server/persistence/registry boundary crossed |
| 9 | PASS | Verification uses `pnpm` and `rg` (Windows-compatible) |
| 10 | N/A | No environment variables touched |
| 11 | N/A | No authentication surfaces |
| 12 | PASS | Tests use `node:test`; no boardgame.io imports in pure helpers |
| 13 | PASS | Exact pnpm commands with expected output shown |
| 14 | PASS | 12 binary, observable acceptance criteria |
| 15 | PASS | DoD includes STATUS.md, DECISIONS.md, WORK_INDEX.md, scope-boundary check |
| 16 | PASS | No new abstractions; explicit control flow required; naming conventions enforced |
| 17 | PASS | Vision Alignment section present; §3, §22 cited; determinism line included |
| 18 | PASS | No literal-string-scoped grep gates that could trip on prose |
| 19 | N/A | No repo-state-summarizing artifacts authored |
| 20 | PASS | N/A justified: engine-only G-state extension; no UI surfaces, no user-visible copy, no funding channels |
| 21 | PASS | N/A justified: no HTTP endpoints touched, no `apps/server/src/**` library functions added or modified |
