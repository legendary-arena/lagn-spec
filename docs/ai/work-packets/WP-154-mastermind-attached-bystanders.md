# WP-154 — Mastermind Attached Bystanders (Graduation of WP-128 Safe-Skip Site)

## Goal

Graduate the WP-128 safe-skip site for `mastermind.attachedBystanders` by:

1. Extending engine state with `G.mastermind.attachedBystanders: CardExtId[]`
   to track mastermind-side bystander captures only (per D-12805
   Interpretation B), and
2. Replacing the `uiState.build.ts` hardcoded `[]` projection with a real
   `resolveDisplay`-based projection, removing one `// SAFE-SKIP-WP128`
   marker.

## Assumes (Locked)

- WP-128 complete; `uiState.build.ts` contains the `// SAFE-SKIP-WP128`
  marker at the `mastermindAttachedBystanders` assignment site;
  `UIMastermindState.attachedBystanders: UIDisplayEntry[]` exists.
- D-12805 locked: `mastermind.attachedBystanders` is mastermind-side captures
  only; city-villain captures remain `G.attachedBystanders`.
- `MastermindState` exists with additive-only fields (existing fields
  unchanged: `id`, `baseCardId`, `tacticsDeck`, `tacticsDefeated`).
- `G.piles.bystanders` exists as a `Zone` (`CardExtId[]`) and is
  deterministic in ordering.
- Strike handler exists (`mastermindStrikeHandler`) and is the only location
  in scope for MVP capture logic.
- Top-of-zone convention: index `0` is the top (matching the villain deck
  reveal pipeline convention: `deck[0]` is the card drawn).
- `G.messages` is `string[]` — plain strings, not structured objects.
- Baseline: `origin/main` at `9dff020` (2026-05-16).

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary — game-engine layer rules
- `docs/ai/DECISIONS.md` — D-12805 (Interpretation B: mastermind bystanders
  are semantically distinct from city-villain bystanders), D-12806
  (safe-skip resolution)
- `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md`
  — graduation template pattern
- `docs/ai/work-packets/WP-128-uistate-projection-extensions-for-board-layout.md`
  §Scope B Safe-Skip Resolutions — `mastermind.attachedBystanders` row
- `.claude/rules/game-engine.md` — rule execution pipeline, move validation
  contract, villain deck reveal pipeline (top-of-zone = index 0)
- `.claude/rules/code-style.md` — naming, comments, function size

## Scope (In)

### Engine state

- Add `attachedBystanders: CardExtId[]` field to `MastermindState` in
  `mastermind.types.ts`.
- Initialize `G.mastermind.attachedBystanders` to `[]` during initial game
  state construction (`buildInitialGameState` or `Game.setup()`).

### Rules (MVP)

- When a Master Strike resolves, attempt to capture exactly one bystander:
  - If `G.piles.bystanders` is non-empty: remove the top bystander
    (index `0`) and push its `CardExtId` into
    `G.mastermind.attachedBystanders`.
  - If `G.piles.bystanders` is empty: perform no capture; append a plain
    string message to `G.messages` describing the empty-supply skip.
- The capture logic lives in `mastermindStrikeHandler` — not as a new
  `RuleEffectType`.

### UI projection graduation

- In `uiState.build.ts`, replace the hardcoded `[]` for
  `mastermindAttachedBystanders` with:
  - A projection from `G.mastermind.attachedBystanders` to
    `UIDisplayEntry[]` using `resolveDisplay` (WP-111 D-11105
    aliasing-defense).
  - The projected array must be newly allocated, and each entry must be a
    new object — no shared references to `G` data (aliasing-defense).
- Remove exactly one `// SAFE-SKIP-WP128` marker at this site.

### Tests & replay

- Add/update tests covering:
  - Initialization (`attachedBystanders` exists and is `[]` at setup)
  - Strike capture behavior (non-empty supply: top bystander removed,
    pushed to mastermind array)
  - Strike no-op + logging (empty supply: no capture, one message appended)
  - Projection correctness (display resolution and aliasing-defense:
    projected array !== source array, entries are new objects)
  - Negative assertion: `G.attachedBystanders` (city-villain) unchanged
    by Master Strike capture
  - Negative assertion: `G.piles.bystanders` length decreases by exactly 1
    when capture occurs, remains unchanged when supply is empty
- Apply 01.5 cascade: update replay hash literal fixture(s) affected by
  new `G` field.

### Documentation

- Add DECISIONS entry D-15401 for the MVP capture rule.
- Update STATUS + WORK_INDEX.

## Out of Scope

- `mastermind.strikePile` graduation — that is WP-153 scope
- City-villain `G.attachedBystanders` changes — that system is unrelated to
  mastermind captures per D-12805
- Mastermind defeat releasing captured bystanders back to supply (future WP —
  MVP does not model mastermind defeat bystander release)
- New `RuleEffectType` for bystander capture (MVP implements inline in the
  strike handler, not as a new effect type)
- Any UI or client-side rendering changes
- Scheme twist pile, escaped pile, economy, or horrors changes
- Tactics defeat / mastermind defeat logic — captured bystanders are not
  released in MVP

## Files Expected to Change

- `packages/game-engine/src/mastermind/mastermind.types.ts` — modified —
  add `attachedBystanders: CardExtId[]` to `MastermindState`
- `packages/game-engine/src/setup/buildInitialGameState.ts` (or equivalent
  setup file) — modified — initialize `mastermind.attachedBystanders` as `[]`
- `packages/game-engine/src/rules/mastermindHandlers.ts` — modified — add
  bystander-capture effect to `mastermindStrikeHandler`
- `packages/game-engine/src/ui/uiState.build.ts` — modified — graduate
  safe-skip site with real projection
- `packages/game-engine/src/ui/uiState.build.test.ts` — modified — flip
  safe-skip value assertion to real projected value
- `packages/game-engine/src/rules/mastermindHandlers.test.ts` — modified —
  verify bystander capture on strike
- `packages/game-engine/src/replay/replay.execute.test.ts` — modified —
  update hash literal (01.5 cascade)
- `docs/ai/DECISIONS.md` — modified — D-15401 entry
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
  objects, never `undefined` or `null` entries
- This field is semantically distinct from `G.attachedBystanders`
  (city-villain captures) per D-12805 Interpretation B — do NOT flatten
  or merge
- MVP rule: each Master Strike captures exactly one bystander from
  `G.piles.bystanders` (index `0` = top); if supply is empty, no capture
  occurs (log to `G.messages` as a plain string beginning with
  `[Master Strike]`)
- Do not use in-place mutation methods on zones (`shift`, `pop`, `splice`).
  Removal from index 0 MUST produce a new array (e.g., destructuring
  `[removed, ...rest]` or `slice(1)` pattern)
- `G.mastermind.attachedBystanders` is append-only during strike resolution
  (no reordering, no removal, no deduplication in MVP)
- UIState projection uses `resolveDisplay` per WP-111 D-11105
  aliasing-defense — projected array is newly allocated, entries are new
  objects (no shared references to `G` data); projection MUST preserve
  source array order (index 0 remains first entry in projected array)
- 01.5 IS INVOKED — new G field changes `computeStateHash`
- Replay hash literal MUST include a `// why:` comment that references:
  "WP-154 adds G.mastermind.attachedBystanders (01.5 cascade)"
- Do not store `undefined` / `null` in `attachedBystanders`; array contains
  only `CardExtId` strings

**Session protocol:**
- Stop and ask on unclear items — never guess
- If the bystander-capture rule needs refinement, log it in DECISIONS.md

**Locked contract values:**
- `UIDisplayEntry` shape: `{ extId: string; display: UICardDisplay }` —
  locked by WP-128
- `MastermindState` field names are additive only — existing fields (`id`,
  `baseCardId`, `tacticsDeck`, `tacticsDefeated`) unchanged
- Top-of-zone = index `0` (matching villain deck reveal pipeline convention)

## Acceptance Criteria

- [ ] `MastermindState` in `mastermind.types.ts` has an
      `attachedBystanders: CardExtId[]` field
- [ ] `buildInitialGameState` (or `Game.setup`) initializes
      `G.mastermind.attachedBystanders` to a new empty array (`[]`)
- [ ] On Master Strike resolve with `G.piles.bystanders.length > 0`, exactly
      one bystander is removed from index `0` of the bystander zone and its
      `CardExtId` appended to `G.mastermind.attachedBystanders`
- [ ] On Master Strike resolve with `G.piles.bystanders.length === 0`, no
      capture occurs and exactly one plain string beginning with
      `[Master Strike]` is appended to `G.messages`
- [ ] `G.piles.bystanders` length decreases by exactly 1 when capture occurs
      and remains unchanged when supply is empty (negative assertion)
- [ ] `uiState.build.ts` projects `UIMastermindState.attachedBystanders` from
      `G.mastermind.attachedBystanders` using `resolveDisplay`; projection
      result is aliasing-safe (new array, new entries — no shared references)
      and preserves source array order
- [ ] Exactly one `// SAFE-SKIP-WP128` marker removed from `uiState.build.ts`
      at the mastermind attached bystanders site
- [ ] `G.attachedBystanders` (city-villain captures) is unchanged by Master
      Strike capture logic (test asserts deep equality before/after)
- [ ] Replay fixture hash literal updated for 01.5 cascade and includes a
      `// why:` comment referencing WP-154 / new
      `G.mastermind.attachedBystanders`
- [ ] `pnpm --filter game-engine test` passes with no failures

## Vision Alignment

**Vision clauses touched:** §3 (determinism), §22 (replay faithfulness).

No conflict: this WP preserves all touched clauses. Bystander capture is
deterministic (index 0 of bystander pile, no randomness). Replay
faithfulness is maintained via 01.5 cascade.

**Non-Goal proximity check:** NG-1..7 not crossed.

**Determinism preservation:** bystander capture is a deterministic removal
from index 0 of a deterministic pile. No new randomness source.

## Funding Surface Gate

N/A — engine-only G-state extension; no UI surfaces, no user-visible copy,
no funding channels referenced.

## API Catalog (§21)

N/A — no HTTP endpoints touched, no `apps/server/src/**` library functions
added or modified.

## Verification Steps

```pwsh
pnpm --filter game-engine test
# Expected: all tests pass, no failures

# Verify safe-skip marker removed
rg "SAFE-SKIP-WP128" packages/game-engine/src/ui/uiState.build.ts --count
# Expected: count reduced by 1 from pre-WP-154 baseline

# Ensure new field referenced only where intended
rg "mastermind\.attachedBystanders|mastermindAttachedBystanders" packages/game-engine/src -n
```

## Decision(s) to Record

**D-15401 — MVP Master Strike captures 1 bystander onto mastermind**

- **Context:** D-12805 Interpretation B separates mastermind captures from
  city-villain captures.
- **Decision:** Each Master Strike attempts to capture exactly one bystander
  from `G.piles.bystanders` (index 0 = top). If empty, capture is skipped
  and a plain string message is appended to `G.messages`.
- **Rationale:** Minimal deterministic modeling that unblocks projection
  graduation and replay faithfulness. No new randomness; no new effect type.
- **Consequences:** Mastermind defeat does not release captured bystanders in
  MVP; future WP may model release.

## Risks / Edge Cases

- If future WPs add a `drawFromTop` or `removeTop` helper to `zoneOps.ts`,
  prefer that over inline slice logic — but for MVP, inline removal of
  index 0 is acceptable (new array via spread/slice).
- Ensure strike handler does not accidentally mutate shared arrays (produce
  new arrays per zoneOps style, even though `zoneOps.moveCardFromZone` is
  by-ID not by-index).
- If `G.piles.bystanders` is shuffled at setup, the capture is still
  deterministic (same index 0 given same shuffle seed).
- Update replay hash fixtures after confirming tests; do not hand-edit
  beyond the literal + `// why:`.

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-15401 entry
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-154 checked off
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 cascade resolved — replay hash literal updated with `// why:`
      comment

## Lint Gate Self-Review

| § | Verdict | Note |
|---|---|---|
| §1 Structure | PASS | All 10 required sections present |
| §2 Constraints block | PASS | Engine-wide + packet-specific + session protocol + locked values |
| §3 Prerequisites | PASS | WP-128, D-12805, MastermindState shape, strike handler, zone, messages type |
| §4 Context refs | PASS | ARCHITECTURE.md, DECISIONS.md, WP-128, code-style, game-engine rules |
| §5 Output completeness | PASS | 10 files listed with status + description; all under ~8 threshold (governance files are standard) |
| §6 Naming | PASS | `attachedBystanders`, `CardExtId`, `MastermindState` per established conventions |
| §7 Dependencies | PASS | No new npm deps |
| §8 Boundaries | PASS | Engine-only; no server/registry/UI runtime imports |
| §9 Windows | N/A | No shell scripts produced |
| §10 Env vars | N/A | No env vars introduced |
| §11 Auth | N/A | No auth surfaces touched |
| §12 Tests | PASS | node:test, makeMockCtx, no boardgame.io imports in test helpers, no network/DB |
| §13 Verification | PASS | Exact pnpm + rg commands with expected output |
| §14 Acceptance | PASS | 9 binary observable items, all reference specific files/values |
| §15 DoD | PASS | STATUS, DECISIONS, WORK_INDEX, scope-boundary check, 01.5 cascade |
| §16 Code style | PASS | No premature abstraction, explicit control flow, readable names, small functions |
| §17 Vision | PASS | §3 + §22 cited; determinism + replay faithfulness confirmed; NG-1..7 clear |
| §18 Prose/grep | PASS | No policed literals restated in prose |
| §19 Bridge staleness | N/A | No repo-state-summarizing artifact produced |
| §20 Funding | PASS (N/A path) | Engine-only; no UI surfaces, no user-visible copy, no funding channels |
| §21 API catalog | PASS (N/A path) | No HTTP endpoints touched |
