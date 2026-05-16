# WP-154 — Mastermind Attached Bystanders

## Goal

Graduate the WP-128 safe-skip site `mastermind.attachedBystanders` by
adding a `G.mastermind.attachedBystanders: CardExtId[]` field that tracks
bystanders captured by the mastermind itself (via Master Strike effects,
per D-12805 Interpretation B). Removes one `// SAFE-SKIP-WP128` marker
from `uiState.build.ts` and replaces the hardcoded `[]` with a real
projection.

## Assumes

- WP-128 (UIState Projection Extensions for Board Layout) is complete.
  `uiState.build.ts` contains the `// SAFE-SKIP-WP128` marker at the
  `mastermindAttachedBystanders` assignment site. `uiState.types.ts`
  defines `UIMastermindState.attachedBystanders: UIDisplayEntry[]`.
- WP-135 (HQ Population & Hero Deck Reservoir) is complete — graduation
  template pattern.
- D-12805 is locked: `mastermind.attachedBystanders` represents
  mastermind-side bystander captures only, NOT city-villain bystander
  captures (those are `G.attachedBystanders`).
- `packages/game-engine/src/mastermind/mastermind.types.ts` exports
  `MastermindState` with fields: `id`, `baseCardId`, `tacticsDeck`,
  `tacticsDefeated` (plus `strikePile` if WP-153 has landed, but this
  WP does not depend on WP-153).
- `packages/game-engine/src/rules/mastermindHandlers.ts` contains
  `mastermindStrikeHandler` which currently only increments a counter.
- `packages/game-engine/src/piles.wounds` and `G.piles.bystanders`
  exist as `Zone` arrays.

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary — game-engine layer rules
- `docs/ai/DECISIONS.md` — D-12805 (Interpretation B: mastermind
  bystanders are semantically distinct from city-villain bystanders),
  D-12806 (safe-skip resolution)
- `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md`
  — graduation template pattern
- `docs/ai/work-packets/WP-128-uistate-projection-extensions-for-board-layout.md`
  §Scope B Safe-Skip Resolutions — `mastermind.attachedBystanders` row
- `.claude/rules/game-engine.md` — rule execution pipeline, move
  validation contract
- `.claude/rules/code-style.md` — naming, comments, function size

## Scope (In)

- Add `attachedBystanders: CardExtId[]` field to `MastermindState` in
  `mastermind.types.ts`
- Initialize `G.mastermind.attachedBystanders` as `[]` in
  `Game.setup()` / `buildInitialGameState`
- Add Master Strike bystander-capture logic: when a Master Strike fires,
  pop a bystander from `G.piles.bystanders` and push its `CardExtId`
  into `G.mastermind.attachedBystanders` (MVP rule: each strike captures
  one bystander if the supply is non-empty)
- Graduate the `uiState.build.ts` projection: replace hardcoded `[]`
  with real derivation from `G.mastermind.attachedBystanders`, remove
  the `// SAFE-SKIP-WP128` marker
- Add/update tests for the new G field, strike handler capture logic,
  and projection
- 01.5 cascade: update `computeStateHash` replay fixture literal
- DECISIONS.md entry for the MVP bystander-capture rule

## Out of Scope

- `mastermind.strikePile` graduation — that is WP-153 scope
- City-villain `G.attachedBystanders` changes — that system is
  unrelated to mastermind captures per D-12805
- Mastermind defeat releasing captured bystanders back to supply (future
  WP — MVP does not model mastermind defeat bystander release)
- New `RuleEffectType` for bystander capture (MVP implements inline in
  the strike handler, not as a new effect type)
- Any UI or client-side rendering changes
- Scheme twist pile, escaped pile, economy, or horrors changes

## Files Expected to Change

- `packages/game-engine/src/mastermind/mastermind.types.ts` — modified —
  add `attachedBystanders: CardExtId[]` to `MastermindState`
- `packages/game-engine/src/setup/buildInitialGameState.ts` (or
  equivalent setup file) — modified — initialize
  `mastermind.attachedBystanders` as `[]`
- `packages/game-engine/src/rules/mastermindHandlers.ts` — modified —
  add bystander-capture effect to `mastermindStrikeHandler`
- `packages/game-engine/src/ui/uiState.build.ts` — modified — graduate
  safe-skip site with real projection
- `packages/game-engine/src/ui/uiState.build.test.ts` — modified — flip
  safe-skip value assertion to real projected value
- `packages/game-engine/src/rules/mastermindHandlers.test.ts` — modified
  — verify bystander capture on strike
- `packages/game-engine/src/replay/replay.execute.test.ts` — modified —
  update hash literal (01.5 cascade)
- `docs/ai/DECISIONS.md` — modified — D-154xx entries
- `docs/ai/STATUS.md` — modified — dated completion entry
- `docs/ai/work-packets/WORK_INDEX.md` — modified — check off WP-154

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
- `G.mastermind.attachedBystanders` is `CardExtId[]` — never full card
  objects
- This field is semantically distinct from `G.attachedBystanders`
  (city-villain captures) per D-12805 Interpretation B — do NOT flatten
  or merge
- MVP rule: each Master Strike captures exactly one bystander from
  `G.piles.bystanders` (if non-empty); if supply is empty, no capture
  occurs (silent skip, log to `G.messages`)
- UIState projection uses `resolveDisplay` per WP-111 D-11105
  aliasing-defense
- 01.5 IS INVOKED — new G field changes `computeStateHash`

**Session protocol:**
- Stop and ask on unclear items — never guess
- If the bystander-capture rule needs refinement, log it in DECISIONS.md

**Locked contract values:**
- `UIDisplayEntry` shape: `{ extId: string; display: UICardDisplay }` —
  locked by WP-128
- `MastermindState` field names are additive only — existing fields
  (`id`, `baseCardId`, `tacticsDeck`, `tacticsDefeated`) unchanged

## Acceptance Criteria

- [ ] `MastermindState` in `mastermind.types.ts` has an `attachedBystanders: CardExtId[]` field
- [ ] `G.mastermind.attachedBystanders` initialized as `[]` in `Game.setup()`
- [ ] Master Strike handler captures one bystander from `G.piles.bystanders` into `G.mastermind.attachedBystanders`
- [ ] When `G.piles.bystanders` is empty, strike handler logs to `G.messages` and skips capture
- [ ] `uiState.build.ts` projects `mastermind.attachedBystanders` from real G data with `resolveDisplay`
- [ ] One `// SAFE-SKIP-WP128` marker removed from `uiState.build.ts`
- [ ] `G.attachedBystanders` (city-villain captures) is NOT modified by this WP
- [ ] `pnpm --filter game-engine test` passes with no failures

## Vision Alignment

**Vision clauses touched:** §3 (determinism), §22 (replay faithfulness).

No conflict: this WP preserves all touched clauses. Bystander capture
is deterministic (top of bystander pile, no randomness). Replay
faithfulness is maintained via 01.5 cascade.

**Non-Goal proximity check:** NG-1..7 not crossed.

**Determinism preservation:** bystander capture is a deterministic
pop from a deterministic pile. No new randomness source.

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

# Verify safe-skip marker removed
rg "SAFE-SKIP-WP128" packages/game-engine/src/ui/uiState.build.ts --count
# Expected: count reduced by 1 from pre-WP-154 baseline
```

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-154xx entries
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-154 checked off
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 cascade resolved — replay hash literal updated with `// why:` comment
