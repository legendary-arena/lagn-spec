# WP-153 — Destination Piles: Strike, Twist, and Escaped Villain

## Goal

Graduate three WP-128 safe-skip sites (`mastermind.strikePile`,
`scheme.twistPile`, `escapedPile`) by adding three new `CardExtId[]`
destination piles to `G` and wiring the existing reveal/escape handlers to
divert resolved cards into them instead of the villain deck discard
(strike/twist) or in addition to the existing counter increment (escaped). Removes three `// SAFE-SKIP-WP128` markers from
`uiState.build.ts` and replaces their hardcoded `[]` with real projections.

## Assumes

- WP-128 (UIState Projection Extensions for Board Layout) is complete.
  `uiState.build.ts` contains the `// SAFE-SKIP-WP128` markers at the
  three assignment sites. `uiState.types.ts` defines `UIDisplayEntry[]`
  as the shape for all three projection fields.
- WP-135 (HQ Population & Hero Deck Reservoir) is complete. It
  established the safe-skip graduation pattern.
- `packages/game-engine/src/types.ts` exports `LegendaryGameState` with
  the current field set (no `strikePile`, `twistPile`, or `escapedPile`).
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` contains
  the reveal pipeline with scheme-twist and mastermind-strike card routing
  to `G.villainDeck.discard` (lines 256-259).
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` contains
  the escape handler that increments `G.counters[ESCAPED_VILLAINS]` but
  does not preserve the escaped card identity (lines 115-123).
- `packages/game-engine/src/board/city.logic.ts` exports
  `pushVillainIntoCity` which returns `escapedCard: CardExtId | null`.
- `packages/game-engine/src/mastermind/mastermind.types.ts` exports
  `MastermindState` (currently: `id`, `baseCardId`, `tacticsDeck`,
  `tacticsDefeated`).

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary — game-engine layer rules
- `docs/ai/DECISIONS.md` — D-12806 (safe-skip resolution), D-12805
  (mastermind.attachedBystanders Interpretation B — this WP does NOT
  touch that field; read for boundary awareness only)
- `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md`
  — graduation template pattern
- `docs/ai/work-packets/WP-128-uistate-projection-extensions-for-board-layout.md`
  §Scope B Safe-Skip Resolutions
- `.claude/rules/game-engine.md` — move validation contract, zone rules
- `.claude/rules/code-style.md` — naming, comments, function size

## Scope (In)

- Add `strikePile: CardExtId[]` field to `MastermindState` in
  `mastermind.types.ts`
- Add `twistPile: CardExtId[]` field to a new `G.scheme` object (new
  `SchemeState` interface: `{ twistPile: CardExtId[] }`). The existing
  top-level `G.schemeSetupInstructions` field is NOT migrated into this
  object — it stays at top-level unchanged. `G.scheme` is a new
  single-field namespace for scheme-owned resolved-card state.
- Add `escapedPile: CardExtId[]` as a top-level field on
  `LegendaryGameState` (`G.escapedPile`). Rationale: `G.city` is a
  fixed `CityZone` 5-tuple and cannot be extended without converting it
  to an object (massive ripple outside this WP's scope). The escaped
  pile is city-adjacent in game logic but structurally lives at G
  top-level.
- Initialize all three piles as `[]` in `Game.setup()` /
  `buildInitialGameState`
- Modify `revealVillainCard` to route `'scheme-twist'` cards to the twist
  pile instead of `G.villainDeck.discard`
- Modify `revealVillainCard` to route `'mastermind-strike'` cards to the
  strike pile instead of `G.villainDeck.discard`
- Modify the escape handler in `revealVillainCard` to push
  `escapedCard` into the escaped pile (in addition to incrementing the
  counter)
- Graduate three `uiState.build.ts` projections: replace hardcoded `[]`
  with real derivations from the new `G` fields, remove three
  `// SAFE-SKIP-WP128` markers
- Add/update tests for the three new G fields and their projections:
  - Routing test: reveal twist → assert NOT in discard, present in twist pile
  - Routing test: reveal strike → assert NOT in discard, present in strike pile
  - Escape test: with card → present in escapedPile; null → not present
  - Ordering test: multiple reveals → order preserved
  - Replay test: hash changes when piles change (01.5 validation)
- 01.5 cascade: update `computeStateHash` replay fixture literal
- DECISIONS.md entries documenting the rationale for the locked G field
  placement (no alternative placements permitted)
- All three piles require inline `// invariant:` comments explaining:
  append-only, order significance, no reshuffle behavior (MVP constraint)

## Out of Scope

- `mastermind.attachedBystanders` graduation — that is WP-154 scope
- `economy.piercing` and `economy.woundsDrawn` — that is WP-155 scope
- `piles.horrorsCount` — that is WP-156 scope
- Reshuffle-from-destination-pile logic (cards in destination piles are
  never reshuffled back into the villain deck in MVP)
- Villain deck discard cleanup (existing cards that would have gone to
  discard pre-WP-153 stay in discard for historical matches; no migration)
- Changing the `REVEALED_CARD_TYPES` array or adding new card types
- Any UI or client-side rendering changes
- Endgame condition changes (escape counter logic is unchanged)

## Files Expected to Change

- `packages/game-engine/src/mastermind/mastermind.types.ts` — modified —
  add `strikePile: CardExtId[]` field to `MastermindState`
- `packages/game-engine/src/types.ts` — modified — add `SchemeState`
  interface + `scheme: SchemeState` field + `escapedPile: CardExtId[]`
  top-level field on `LegendaryGameState`
- `packages/game-engine/src/setup/buildInitialGameState.ts` (or
  equivalent setup file) — modified — initialize three new piles as `[]`
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — modified
  — route scheme-twist and mastermind-strike cards to new piles; push
  escaped card to escaped pile
- `packages/game-engine/src/ui/uiState.build.ts` — modified — graduate
  three safe-skip sites with real projections
- `packages/game-engine/src/ui/uiState.build.test.ts` — modified — flip
  safe-skip value assertions to real projected values
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` —
  modified — verify card routing to new piles
- `packages/game-engine/src/replay/replay.execute.test.ts` — modified —
  update hash literal (01.5 cascade)
- `docs/ai/DECISIONS.md` — modified — new D-153xx entries
- `docs/ai/STATUS.md` — modified — dated completion entry
- `docs/ai/work-packets/WORK_INDEX.md` — modified — check off WP-153

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
- The three new piles are `CardExtId[]` — never full card objects
- Strike pile lives on `MastermindState` (the mastermind owns its
  resolved strikes)
- All three piles initialized as `[]` at setup
- UIState projection uses `resolveDisplay` per WP-111 D-11105
  aliasing-defense (per-entry shallow copy)
- 01.5 IS INVOKED — new G fields change `computeStateHash`
- All destination piles use suffix `Pile` — no `Deck`, `Zone`, or
  `Collection` alternatives permitted
- It is a violation for any `'scheme-twist'` or `'mastermind-strike'`
  card to appear in `G.villainDeck.discard` after this WP — tests MUST
  fail if such cards are detected in discard

**Locked Data Placement (WP-153):**
- `G.mastermind.strikePile: CardExtId[]` (REQUIRED)
- `G.scheme.twistPile: CardExtId[]` (REQUIRED — `G.scheme` is a NEW
  single-field `SchemeState` object: `{ twistPile: CardExtId[] }`.
  Existing `G.schemeSetupInstructions` stays at top-level, unchanged.)
- `G.escapedPile: CardExtId[]` (REQUIRED — top-level on G. `G.city` is
  a fixed `CityZone` 5-tuple that cannot be extended; escaped pile is
  city-adjacent in game logic but structurally top-level.)

No alternative placements are permitted.

**Routing Contract (authoritative):**
- `'scheme-twist'` cards:
  → MUST be pushed to `G.scheme.twistPile`
  → MUST NOT be added to `G.villainDeck.discard`
- `'mastermind-strike'` cards:
  → MUST be pushed to `G.mastermind.strikePile`
  → MUST NOT be added to `G.villainDeck.discard`
- Escaped villains:
  → MUST be pushed to `G.escapedPile`
  → MUST ALSO increment `G.counters[ESCAPED_VILLAINS]`

**Escape Handler Contract:**
- If `escapedCard !== null`: push to `G.escapedPile`
- If `escapedCard === null`: DO NOTHING (no push)
- Counter increment MUST occur regardless of null state (existing
  behavior preserved)

**Pile Ordering Invariant:**
- All destination piles (`strikePile`, `twistPile`, `escapedPile`) are
  append-only
- New entries are pushed to the end (`array.push`)
- Order reflects chronological resolution order from the reveal pipeline
- No sorting or reordering is permitted

**Setup Invariant:**
- All three piles MUST exist on G at setup:
  - `G.mastermind.strikePile = []`
  - `G.scheme = { twistPile: [] }`
  - `G.escapedPile = []`
- Absence of any of these keys is a hard failure condition

**UI Projection Contract:**
- Projections MUST preserve underlying G array order (index-stable)
- `resolveDisplay` must be applied per entry with shallow copy semantics
  (WP-111 D-11105)
- No filtering, sorting, or transformation beyond mapping is permitted
- Each projected entry MUST be a new object instance (no reference reuse
  from prior frames)

**Single Write Path Constraint:**
- Destination pile mutation MUST occur only within `revealVillainCard`
- No other function may push to `G.mastermind.strikePile`,
  `G.scheme.twistPile`, or `G.escapedPile`

**Replay Hash Coverage (01.5):**
- `computeStateHash` MUST include all three new piles explicitly
- Adding/removing entries from any of the three piles MUST change the hash

**Setup Type Safety:**
- All three piles MUST be present on the fully typed
  `LegendaryGameState` (not conditionally added or optional)

**Session protocol:**
- Stop and ask on unclear items — never guess
- If a design choice is ambiguous, log it in DECISIONS.md before proceeding

**Locked contract values:**
- `UIDisplayEntry` shape: `{ extId: string; display: UICardDisplay }` —
  locked by WP-128
- `REVEALED_CARD_TYPES`: `'villain' | 'henchman' | 'bystander' |
  'scheme-twist' | 'mastermind-strike'` — locked, not modified
- `ENDGAME_CONDITIONS.ESCAPED_VILLAINS` counter key — unchanged

## Acceptance Criteria

- [ ] `MastermindState` in `mastermind.types.ts` has a `strikePile: CardExtId[]` field
- [ ] `LegendaryGameState` has a twist pile `CardExtId[]` field accessible for projection
- [ ] `LegendaryGameState` has an escaped pile `CardExtId[]` field accessible for projection
- [ ] All three piles are initialized as `[]` in `Game.setup()` output
- [ ] `revealVillainCard` routes `'scheme-twist'` cards to the twist pile, NOT to `G.villainDeck.discard`
- [ ] `revealVillainCard` routes `'mastermind-strike'` cards to the strike pile, NOT to `G.villainDeck.discard`
- [ ] Escaped villain cards are pushed to the escaped pile (counter increment unchanged)
- [ ] `uiState.build.ts` projects `mastermind.strikePile` from real G data with `resolveDisplay`
- [ ] `uiState.build.ts` projects `scheme.twistPile` from real G data with `resolveDisplay`
- [ ] `uiState.build.ts` projects `escapedPile` from real G data with `resolveDisplay`
- [ ] Three `// SAFE-SKIP-WP128` markers removed from `uiState.build.ts`
- [ ] `'scheme-twist'` cards never appear in `G.villainDeck.discard` after routing
- [ ] `'mastermind-strike'` cards never appear in `G.villainDeck.discard` after routing
- [ ] Destination piles preserve insertion order (verified via test)
- [ ] Escaped pile only contains non-null `CardExtId` values
- [ ] All projection arrays match G arrays 1:1 in length and order
- [ ] `computeStateHash` changes when any destination pile changes
- [ ] No function outside `revealVillainCard` mutates destination piles (verified by test or code inspection)
- [ ] UI projection entries are fresh object instances (no reference reuse)
- [ ] `pnpm --filter game-engine test` passes with no failures

## Vision Alignment

**Vision clauses touched:** §3 (determinism), §22 (replay faithfulness).

No conflict: this WP preserves all touched clauses. The three new G
fields are deterministic (populated by the existing reveal pipeline and
escape handler, both of which use `ctx.random.*` only). Replay
faithfulness is maintained — `computeStateHash` will include the new
fields, and the 01.5 cascade updates the fixture literal.

**Non-Goal proximity check:** NG-1..7 not crossed — no user-facing,
paid, persuasive, or competitive surfaces touched.

**Determinism preservation:** all new state mutations are deterministic
continuations of existing deterministic handlers. No new randomness
source introduced.

## Funding Surface Gate

N/A — engine-only G-state extensions; no UI surfaces, no user-visible
copy, no funding channels referenced.

## API Catalog (§21)

N/A — no HTTP endpoints touched, no `apps/server/src/**` library
functions added or modified.

## Verification Steps

```pwsh
pnpm --filter game-engine test
# Expected: all tests pass, no failures

# Verify safe-skip markers reduced by 3
# (from 8 to 5 — remaining: docstring reference on line 14,
# mastermind.attachedBystanders, economy.piercing, economy.woundsDrawn,
# piles.horrorsCount)
rg "SAFE-SKIP-WP128" packages/game-engine/src/ui/uiState.build.ts --count
# Expected: 5 (1 docstring + 4 code markers)
```

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-153xx entries for G field
      placement decisions
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-153 checked off
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 cascade resolved — replay hash literal updated with `// why:` comment
