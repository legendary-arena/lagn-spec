# WP-156 — Horrors Pile

## Goal

Graduate the WP-128 safe-skip site `piles.horrorsCount` by adding a
`horrors: Zone` field to `GlobalPiles` and wiring setup-time population
for scenarios that use the Horrors mechanic. Removes one
`// SAFE-SKIP-WP128` marker from `uiState.build.ts` and replaces the
hardcoded `0` with a real count derived from `G.piles.horrors.length`.

## Assumes

- WP-128 (UIState Projection Extensions for Board Layout) is complete.
  `uiState.build.ts` contains the `// SAFE-SKIP-WP128` marker at the
  `horrorsCount` assignment site. `uiState.types.ts` defines
  `UISharedPilesState.horrorsCount: number` (always present, default `0`
  per D-12802).
- WP-135 (HQ Population & Hero Deck Reservoir) is complete — graduation
  template pattern.
- `packages/game-engine/src/state/zones.types.ts` exports `GlobalPiles`
  with fields: `bystanders`, `wounds`, `officers`, `sidekicks`.
- No existing Horrors support exists anywhere in the game engine.
- The Horrors mechanic is scenario-dependent: the pile is populated at
  setup time only when the selected scheme requires it. MVP may ship
  with the pile always empty (no scheme currently triggers Horrors
  population) — the field exists for the projection contract and future
  scheme WPs.

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary — game-engine layer rules
- `docs/ai/DECISIONS.md` — D-12802 (`piles.horrorsCount` always present,
  default `0`), D-12806 (safe-skip resolution)
- `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md`
  — graduation template pattern
- `docs/ai/work-packets/WP-128-uistate-projection-extensions-for-board-layout.md`
  §Scope B Safe-Skip Resolutions — `piles.horrorsCount` row
- `packages/game-engine/src/state/zones.types.ts` — current `GlobalPiles`
  shape
- `.claude/rules/game-engine.md` — G serialization, zone rules
- `.claude/rules/code-style.md` — naming, comments, function size

## Scope (In)

- Add `horrors: Zone` field to `GlobalPiles` in `zones.types.ts`
- Initialize `G.piles.horrors` as `[]` in `Game.setup()` /
  `buildInitialGameState` (MVP: always empty — no scheme currently
  populates Horrors)
- Graduate the `uiState.build.ts` projection: replace hardcoded `0`
  with `gameState.piles.horrors.length`, remove the
  `// SAFE-SKIP-WP128` marker
- Update zone validation (`zones.validate.ts`) to include `horrors` in
  the `GlobalPiles` shape check
- Add/update tests for the new G field, setup initialization, zone
  validation, and projection
- 01.5 cascade: update `computeStateHash` replay fixture literal
- DECISIONS.md entry

## Out of Scope

- Scheme-specific Horrors population logic (future scheme WPs will
  define which schemes populate the Horrors pile and with what cards)
- Horrors-specific gameplay mechanics (draw, resolve, discard of Horror
  cards) — future WP scope
- Adding a `horrorsCount` field to `MatchSetupConfig` (the pile is
  scheme-controlled, not user-configured)
- Destination piles — that is WP-153 scope
- Mastermind bystanders — that is WP-154 scope
- Economy extensions — that is WP-155 scope
- Any UI or client-side rendering changes

## Files Expected to Change

- `packages/game-engine/src/state/zones.types.ts` — modified — add
  `horrors: Zone` to `GlobalPiles`
- `packages/game-engine/src/setup/buildInitialGameState.ts` (or
  equivalent setup file) — modified — initialize `piles.horrors` as `[]`
- `packages/game-engine/src/state/zones.validate.ts` — modified —
  include `horrors` in structural validation
- `packages/game-engine/src/ui/uiState.build.ts` — modified — graduate
  safe-skip site with real projection
- `packages/game-engine/src/ui/uiState.build.test.ts` — modified — flip
  safe-skip value assertion to real projected value
- `packages/game-engine/src/state/zones.validate.test.ts` — modified —
  add `horrors` to validation test fixtures
- `packages/game-engine/src/replay/replay.execute.test.ts` — modified —
  update hash literal (01.5 cascade)
- `docs/ai/DECISIONS.md` — modified — D-156xx entry
- `docs/ai/STATUS.md` — modified — dated completion entry
- `docs/ai/work-packets/WORK_INDEX.md` — modified — check off WP-156

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
- `horrors` is `Zone` (i.e., `CardExtId[]`) — consistent with existing
  `GlobalPiles` field types
- MVP: pile is always `[]` — no scheme currently populates it. The
  field exists to close the projection contract. Future scheme WPs will
  add population logic.
- `horrorsCount` in UIState is always `gameState.piles.horrors.length`
  — never a separate counter
- D-12802 is satisfied: `horrorsCount` is always present with `0`
  default (now derived from `.length` instead of hardcoded)
- 01.5 IS INVOKED — new G field changes `computeStateHash`

**Session protocol:**
- Stop and ask on unclear items — never guess

**Locked contract values:**
- `UISharedPilesState.horrorsCount: number` — locked by WP-128
- Existing `GlobalPiles` fields (`bystanders`, `wounds`, `officers`,
  `sidekicks`) — unchanged

## Acceptance Criteria

- [ ] `GlobalPiles` in `zones.types.ts` has a `horrors: Zone` field
- [ ] `G.piles.horrors` initialized as `[]` in `Game.setup()`
- [ ] Zone validation in `zones.validate.ts` checks `horrors` field
- [ ] `uiState.build.ts` projects `piles.horrorsCount` from `gameState.piles.horrors.length`
- [ ] One `// SAFE-SKIP-WP128` marker removed from `uiState.build.ts`
- [ ] `pnpm --filter game-engine test` passes with no failures

## Vision Alignment

**Vision clauses touched:** §3 (determinism).

No conflict: this WP preserves all touched clauses. The Horrors pile
is initialized deterministically (empty array) and projected as a
count. No gameplay mechanics added.

**Non-Goal proximity check:** NG-1..7 not crossed.

**Determinism preservation:** empty-array initialization is trivially
deterministic. No new randomness source.

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
# Expected: count reduced by 1 from pre-WP-156 baseline
```

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-156xx entry
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-156 checked off
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 cascade resolved — replay hash literal updated with `// why:` comment
