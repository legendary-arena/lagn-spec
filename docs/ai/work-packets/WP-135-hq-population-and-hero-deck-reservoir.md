# WP-135 — HQ Population & Hero Deck Reservoir

**Status:** Ready
**Primary Layer:** Game Engine — Setup + State + Moves (`packages/game-engine/src/setup/`, `packages/game-engine/src/board/`, `packages/game-engine/src/moves/`, `packages/game-engine/src/types.ts`, `packages/game-engine/src/ui/`)
**Dependencies:** WP-016 (`recruitHero` move shipped, HQ-population deferred); WP-018 (`G.cardStats` sibling-snapshot pattern); WP-111 (`G.cardDisplayData` sibling-snapshot pattern); WP-128 (`UIState` projection contract; closes the `decks.heroDeckCount` safe-skip site under D-12806); WP-129 (board-layout client surface — visible consumer of HQ + heroDeckCount)

---

## Session Context

WP-016 added `recruitHero({ hqIndex })` as a `play.main` move but deferred the HQ-population logic with the comment `// why: recruit slot population is WP-016 scope` at `packages/game-engine/src/setup/buildInitialGameState.ts:308-309`; that scope was never executed and `initializeHq()` returns `[null, null, null, null, null]` at every match start. WP-128 anticipated this — `decks.heroDeckCount` is one of the eight D-12806 Option A safe-skip sites in `uiState.build.ts`, projected as constant `0` until a future WP adds the underlying `G` field. WP-129 made the gap visible by rendering empty HQ slots + `[0]` Hero Deck on the board layout. This packet closes both gaps in lockstep.

---

## Goal

> **This packet locks the hero deck composition model (rarity → copy counts) as an explicit decision (D-13501) before any setup logic is executed.** Deck math is contractual, not advisory: it sets the reservoir size, the HQ fill prefix length, the test invariants, and the replay-hash input shape simultaneously. Locking the rarity map at session start is the single decision that prevents downstream drift.

After this packet, `Game.setup()` builds a deterministic per-match hero-deck reservoir at `G.heroDeck: CardExtId[]` from each entry in `MatchSetupConfig.heroDeckIds`, shuffles it via `ctx.random.Shuffle`, and pops the first 5 cards into `G.hq` so HQ slots render with real heroes at match start. The `recruitHero` move refills the vacated slot from `G.heroDeck.shift()` on success; when the deck is empty, the slot stays empty (no auto-shuffle of recruited cards back into the deck — recruited cards belong to the active player's discard per WP-016). `G.cardStats` and `G.cardDisplayData` are extended to cover the hero card instances (cost, attack, recruit, name, imageUrl) so cost-gating and display-name resolution work end-to-end. UIState's `decks.heroDeckCount` projection graduates from the WP-128 / D-12806 safe-skip constant `0` to `G.heroDeck.length`. The match-start "structurally unwinnable" state (4 attack max per turn from starter cards alone vs Magneto's 6-attack tactic cost) is no longer the engine's shipped reality.

---

## Assumes

- WP-016 complete. `recruitHero({ hqIndex })` exists at `packages/game-engine/src/moves/recruitHero.ts` and is registered on `LegendaryGame.moves` at the `play.main` stage.
- WP-018 complete. `buildCardStats` builds `G.cardStats` from registry hero / villain / mastermind data; the `parseCardStatValue` helper handles `"2*"` / `"2+"` / integers.
- WP-111 complete. `buildCardDisplayData` builds `G.cardDisplayData` covering registry heroes / villains / henchmen / mastermind base cards; `UNKNOWN_DISPLAY_PLACEHOLDER` (name `'<unknown>'`) is the projection-time fallback for missing entries.
- WP-128 complete. `UIDecksState` exists at `packages/game-engine/src/ui/uiState.types.ts` with the `heroDeckCount: number` field; `uiState.build.ts:projectDecks` ships the safe-skip constant `0` with the `// SAFE-SKIP-WP128` marker.
- WP-129 complete. `<HQRow>` and `<TopHudBar>` consume `hq.slots` / `hq.slotDisplay` / `decks.heroDeckCount` from the projection.
- `MatchSetupConfig.heroDeckIds: string[]` — set-qualified hero ext_ids (e.g., `'core/spider-man'`, per D-10014).
- `pnpm --filter @legendary-arena/game-engine build` exits 0 on the WP-129 / EC-132 head (`f1de406`).
- `pnpm --filter @legendary-arena/game-engine test` baseline `621 / 135 / 0` (locked at WP-128 / EC-131 close).
- `data/cards/<setAbbr>.json` exposes each hero's `cards: { rarityLabel, slot, hc, cost, attack, recruit, imageUrl, ... }[]` array. The 14-cards-per-hero canonical Marvel Legendary deck composition (rarity-driven copy counts) is NOT pre-encoded as `cardCounts` on either the hero or the card; the executor locks the rarity → copy-count mapping at session start (see D-DEC-1).

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §"Game State Architecture"` — authoritative on what may live in `G`. New `G.heroDeck` field must be JSON-serializable; never persisted; rebuilt from `setupData` on every match.
- `docs/ai/ARCHITECTURE.md §"The Reveal Pipeline"` — sibling-snapshot pattern (`G.cardStats`, `G.cardDisplayData`, `G.villainDeckCardTypes`, `G.cardKeywords`); `G.heroDeck` follows the same setup-time-resolved / runtime-immutable pattern.
- `.claude/rules/game-engine.md §Phases` + §"Move Validation Contract" — `recruitHero` modification must keep the three-step contract (validate args → check stage gate → mutate G via helpers).
- `.claude/rules/persistence.md §Class 1 — Runtime State` — `G.heroDeck` is runtime state, never persisted.
- `packages/game-engine/src/types.ts` — read entirely. `LegendaryGameState` interface gains the `heroDeck: CardExtId[]` field.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — read entirely; lines 300-330 show the `LegendaryGameState` literal that needs the new field; line 308-309 comment is the explicit gap this packet closes.
- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — sibling-pattern reference; copy the structure verbatim (registry walk → flat array → shuffle → pop into zone) for `buildHeroDeck`. Do NOT import or invoke `buildVillainDeck`.
- `packages/game-engine/src/economy/economy.logic.ts` — read entirely; the hero-card-instance walk lands here (each hero's `cards[]` × per-card copy count). Identify what cardStats keys today refer to (set-qualified ext_ids, per D-10014).
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — read entirely; sibling extension to buildCardStats for display data; same walk shape.
- `packages/game-engine/src/board/city.logic.ts` — `initializeHq()` is the gap; either extend signature or add a sibling `fillHqFromDeck(deck, slotCount)` helper. Pure function; no `boardgame.io` import; no `.reduce()`.
- `packages/game-engine/src/moves/recruitHero.ts` — read entirely; on success, refill `G.hq[hqIndex]` from `G.heroDeck` via a pure helper (no inline shift/splice). Per WP-016 D-1602, the recruited hero card moves to the active player's discard.
- `packages/game-engine/src/ui/uiState.build.ts` — read entirely; `projectDecks` returns `decks.heroDeckCount`; replace the safe-skip constant `0` with `gameState.heroDeck.length`. Remove the `// SAFE-SKIP-WP128` marker on the assignment. Decrement the marker count from 8 to 7.
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — drift test asserts the safe-skip marker count and the canonical field set; both update.
- `packages/game-engine/src/replay/replay.execute.test.ts` — `PRE_WP080_HASH` literal updates per WP-128 D-12807 conditional-cascade procedure (capture pre / capture post / compare; update only on divergence).
- `data/cards/core.json` — sample hero data. Each hero's `cards: []` array carries 4 distinct cards with `rarityLabel` ∈ `{ 'Common 1', 'Common 2', 'Uncommon', 'Rare' }`; the canonical 14-cards-per-hero deck composition is rarity-driven (D-DEC-1).
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations: spell out `heroDeck`, never `hd`), Rule 6 (`// why:` on every `ctx.random.*` use; on the safe-skip removal site; on the rarity → count map), Rule 13 (ESM only).
- `docs/ai/DECISIONS.md §D-12806` — the safe-skip allowlist this packet partially closes. Read the resolution clause: "the consuming site needs no behavioral change — only fixture/test updates" — this packet is the test of that claim from the ENGINE side; consuming SFC behavior is unchanged.
- `docs/ai/DECISIONS.md §D-12807` — 01.5 cascade resolution procedure; this packet's `G` shape change WILL trigger the cascade per D-12807's "Future contributor note" — apply the binary procedure.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.Shuffle` only (the hero-deck shuffle).
- Never throw inside `Game.setup()` except for unrecoverable input violations (per the canonical rule that only `Game.setup()` may throw); `buildHeroDeck` throws on invalid registry data — including unknown `rarityLabel` per D-DEC-1 Option A loud-fail — with a full-sentence Error message that names the offending hero ext_id, the unrecognized label, and the supported four-label set.
- Never persist `G`, `ctx`, or any runtime state.
- `G.heroDeck` must be JSON-serializable (`CardExtId[]` — bare strings only, no objects, no functions, no Maps/Sets).
- ESM only, Node v22+.
- `node:` prefix on Node built-in imports.
- Test files use `.test.ts`.
- No database / network / filesystem in `buildHeroDeck` or `recruitHero` modifications.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Determinism Envelope (must not be widened):**
- Exactly **one** shuffle of the hero deck occurs at setup, via `ctx.random.Shuffle`. No second shuffle anywhere in the engine post-setup.
- HQ population is a deterministic prefix pop (FIFO from index 0) from that shuffled deck. Setup may not re-order, sort, partition, or otherwise rearrange the deck after the shuffle.
- No other randomization or reordering is permitted in setup or moves. `recruitHero` mutates `G.heroDeck` via a single front-pop per success — no batching, no replacement, no auto-reshuffle of recruited cards back into the deck.
- The registry walk that builds the unshuffled `buildHeroDeckCards` output is itself ordering-stable: heroes iterated in `config.heroDeckIds` order, cards iterated per the registry's `cards[]` array order, copies appended in rarity-map order. Any reordering of the walk changes the post-shuffle distribution and therefore the replay hash.
- Future contributors: refactors that "preserve test pass" but widen this envelope (e.g., introducing a per-turn shuffle, batching front-pops, sorting the deck for "predictability") are forbidden — they break replay determinism. The replay-hash regression guard is the canary; if it diverges without a corresponding 01.5 cascade in the diff, the envelope was widened.

**Packet-specific:**
- `G.heroDeck` is a **CardExtId-strings-only** array. Never card objects, never display payloads. Aliasing-defense: every helper that mutates the deck returns a NEW array (no in-place `.push()` / `.shift()` / `.splice()`); the orchestrator and `recruitHero` rebind `G.heroDeck = newArray` after each helper call. The pure helpers in §D / §F are the only mutator entry points; arbitrary `G.heroDeck.shift()` in move bodies is forbidden.
- The hero-card-instance ext_id format is set-qualified per D-10014: `<setAbbr>/<heroSlug>/<cardSlug>` (e.g., `core/spider-man/astonishing-strength`). Locked at D-DEC-2.
- `buildHeroDeck` is a **pure helper** (no `boardgame.io` import; no `Math.random`; no I/O). Receives a `ShuffleProvider` argument the same way `buildPlayerState` does (per `playerInit.ts:25-29`).
- `recruitHero` move modification is the SOLE site where `G.heroDeck` is mutated post-setup. Any other mutation is a violation of the move-as-only-mutator contract.
- Hero-deck refill on recruit uses a pure helper (`refillHqSlot(hq, hqIndex, heroDeck)`) returning `{ hq, heroDeck }`; no inline `splice` / `shift` in the move body.
- When `G.heroDeck` is empty and `recruitHero` succeeds, the vacated slot stays `null` (no auto-reshuffle of the active player's discard; that's a separate engine WP if the rule ever needs it).
- `decks.heroDeckCount` projection graduates from constant `0` to `gameState.heroDeck.length` at exactly one site (`uiState.build.ts:projectDecks`). The `// SAFE-SKIP-WP128` marker on that line is removed; the marker count drops from 8 to 7.
- The drift test pinning the safe-skip count updates from 8 to 7. The drift test pinning the new `G` field updates to include `heroDeck`.
- 01.5 conditional cascade IS INVOKED per WP-128 D-12807's "Future contributor note": adding `G.heroDeck` changes the `computeStateHash` input shape. EC binary procedure: capture `PRE_WP080_HASH` from `replay.execute.test.ts` before any edit; run full engine test post-edit; if hash diverges, update the literal in a single-line edit with a `// why:` comment citing 01.5 + WP-128 D-12807 + WP-135.
- 01.6 post-mortem MANDATORY: new long-lived `G` field + new contract surface (`buildHeroDeck` factory) + new sibling-snapshot site (the rarity → copy-count map).

**Session protocol:**
- If hero data lacks expected fields (e.g., a hero's `cards[]` is empty, or `rarityLabel` is missing), STOP and surface to the human via execution summary. Do not invent fallback values.
- If the registry's hero card data uses a different ext_id format than `<setAbbr>/<heroSlug>/<cardSlug>`, STOP and ask before locking D-DEC-2.

**Locked contract values (verbatim — do not paraphrase):**
- **MatchSetupConfig fields:** `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`.
- **PlayerZones keys:** `deck` | `hand` | `discard` | `inPlay` | `victory`.
- **HQ slot count (MVP):** 5 (per WP-015; D-12903 from WP-129 anticipates 6-slot variants for non-MVP scenarios but MVP locks 5).
- **Phase / stage names:** phases `'lobby'` | `'setup'` | `'play'` | `'end'`; stages `'start'` | `'main'` | `'cleanup'`.

---

## Debuggability & Diagnostics

- `G.heroDeck.length` is observable post-setup and post-recruit; tests assert exact counts.
- `recruitHero` SHOULD append a one-line entry to `G.messages` like `"Player {id} recruited {heroDisplay.name}; HQ slot {hqIndex} refilled from heroDeck (heroDeck.length: {N})"` for replay inspection.
- Failures localizable via `JSON.stringify(G.heroDeck)` — bare-string array, fully inspectable.
- The shuffle is deterministic given the match seed (per `ctx.random.Shuffle`); replay reproduces the exact deck order.
- Drift test asserts: every CardExtId in the post-setup `G.heroDeck` AND in `G.hq` has a corresponding entry in `G.cardStats` AND in `G.cardDisplayData`. No unknown ext_ids leak through.

---

## Scope (In)

### A) New `G` field — `heroDeck: CardExtId[]`

- **`packages/game-engine/src/types.ts`** — modified:
  - `LegendaryGameState` gains `heroDeck: CardExtId[]`.
  - JSDoc cites WP-135 + the WP-014B `villainDeck` precedent (sibling shape).
  - `// why:` comment on the field declaration: "Reservoir of unrecruited hero cards. Refilled into HQ on each successful recruitHero. Closes WP-128 D-12806 safe-skip site `decks.heroDeckCount`."

### B) New helper — `buildHeroDeck`

- **`packages/game-engine/src/setup/buildHeroDeck.ts`** — new:
  - Local structural `RegistryReader` interface mirroring `economy/economy.logic.ts` `CardStatsRegistryReader` (lines 89-100, with `isCardStatsRegistryReader` runtime type guard at line 395) — no runtime registry import.
  - `buildHeroDeckCards(heroDeckIds: string[], registry: RegistryReader): CardExtId[]` — pure function returning the unshuffled flat array of hero card ext_ids per the rarity → copy-count map (D-DEC-1).
  - `shuffleHeroDeck(cards: CardExtId[], context: ShuffleProvider): CardExtId[]` — wraps `context.random.Shuffle`. Mirrors `playerInit.ts:shuffleDeck`.
  - `buildHeroDeck(heroDeckIds, registry, context): CardExtId[]` — composes the two; the canonical entry point.
  - JSDoc cites WP-016 (gap closure) + WP-014B (sibling shape) + WP-128 D-12806 (safe-skip closure) + D-DEC-1 (rarity map) + D-DEC-2 (ext_id format).
  - `// why:` comment on the rarity-to-copy-count map declaration: per D-DEC-1, document the 5/3/3/3 mapping (or whatever the executor locks) with a citation to the canonical Marvel Legendary 14-cards-per-hero rule.
  - **Throws on unknown `rarityLabel` (per D-DEC-1, Option A loud-fail lock).** When a hero card carries a `rarityLabel` outside the locked set `{ 'Common 1', 'Common 2', 'Uncommon', 'Rare' }`, `buildHeroDeck` throws a full-sentence Error citing the offending hero ext_id, the unrecognized `rarityLabel`, and the supported set. This is permitted because `buildHeroDeck` runs only inside `Game.setup()` (the canonical throw site). MVP loadouts MUST select `MatchSetupConfig.heroDeckIds` from sets whose hero cards use only the four locked labels (`core.json` and any other compliant set); cross-set rarity support (e.g., `'Common 3'` and `'Uncommon 2'` observed in `amwp.json` and similar) is deferred to a follow-up engine WP that extends D-13501 with a tabletop-rule citation. `// why:` comment on the throw site cites D-13501 + the deferred follow-up WP ID.

### C) Setup orchestration — `buildInitialGameState`

- **`packages/game-engine/src/setup/buildInitialGameState.ts`** — modified:
  - Import `buildHeroDeck`.
  - After `buildVillainDeck` and before the `LegendaryGameState` literal: build the hero deck via `buildHeroDeck(config.heroDeckIds, registry, context)` exactly once, then call `fillHqFromDeck(shuffledDeck, 5)` (from §D) which returns `{ hq, remainingDeck }`. The HQ initial draw consumes the **same deck instance** later used for refills (the `remainingDeck` returned from `fillHqFromDeck` IS `G.heroDeck`); there is no second deck construction, no parallel reservoir, no per-zone copy.
  - Replace `hq: initializeHq()` with `hq: fillHqResult.hq` (use the helper from §D, NOT inline slicing in the orchestrator).
  - Add `heroDeck: fillHqResult.remainingDeck` field to the literal.
  - Update the existing comment on line 308-309 from "HQ initialized empty; recruit slot population is WP-016 scope" to "HQ filled from first 5 of the shuffled hero deck via fillHqFromDeck; remainder stored at G.heroDeck per WP-135."
  - `// why:` comment on the `ctx.random.Shuffle`-driven hero-deck construction citing WP-135 + the determinism envelope (single-shuffle + deterministic-prefix-pop).

### D) HQ helper — `fillHqFromDeck`

- **`packages/game-engine/src/board/city.logic.ts`** — modified:
  - Add a new pure helper `fillHqFromDeck(heroDeck: CardExtId[], slotCount: number): { hq: HqZone; remainingDeck: CardExtId[] }`.
  - Pops up to `slotCount` cards from the front of the deck into the HQ; remaining cards stay in `remainingDeck`.
  - When `heroDeck.length < slotCount`, fills as many slots as possible and leaves the rest as `null`.
  - No `boardgame.io` import; no `.reduce()`; explicit `for` loop. Returns NEW arrays for both `hq` and `remainingDeck`; never mutates the input `heroDeck`.
  - **Index Semantics (locked):** HQ index `0` is the deterministic first-fill slot at setup AND on refill. The deck's top card (post-shuffle, position 0) MUST land at HQ slot 0. Tests assert: when `heroDeck.length >= 1`, `hq[0] !== null`; when `heroDeck.length >= 5`, `hq[0..4]` are all non-null in deck-front order. This contract is non-negotiable — if HQ ever becomes non-linear (e.g., column-grouped variants), the new layout is a separate WP, not a refactor of `fillHqFromDeck`.
  - `// why:` comment on the helper: "Pure helper — pops front-to-back so the deck's top card lands at HQ slot 0. Mirrors the city's pushVillainIntoCity entry-edge pattern; engine indexes 0-4 with slot 0 as the canonical first-fill site. Index 0 = first-fill slot is locked semantics; do not reorder."
  - `initializeHq()` is preserved verbatim (returns `[null, null, null, null, null]`); it remains the contract for "no hero deck supplied" paths (e.g., test fixtures that don't need HQ filled). The orchestrator's call site swaps to `fillHqFromDeck`.

### E) HQ refill on recruit — `recruitHero` modification

- **`packages/game-engine/src/moves/recruitHero.ts`** — modified:
  - On successful recruit (post-discard append + post-cardStats deduction), call a new pure helper `refillHqSlot(hq, hqIndex, heroDeck): { hq, heroDeck }`.
  - When `heroDeck.length === 0`, the slot stays `null` and `heroDeck` remains `[]`.
  - **Replace the existing `recruitHero` `G.messages` push (currently `recruitHero.ts:76-78`, format `"Player {playerId} recruited \"{cardId}\" from HQ slot {hqIndex}."`) with a single deterministic one-line entry in the WP-135 locked format. There is exactly ONE `G.messages` push per successful `recruitHero`, not two.** The string format is stable and MUST NOT include timestamps, wall-clock data, random tokens, object addresses, or any other non-deterministic data. Replay diffs depend on exact byte-equality of `G.messages`; future "helpful" additions (millisecond timestamps, debug context, formatted dates) silently break replay determinism. Locked format: `"Player {playerId} recruited {heroExtId}; HQ slot {hqIndex} refilled from heroDeck (heroDeck.length: {N})"` where `{playerId}` is the bare engine playerID string, `{heroExtId}` is the recruited card's set-qualified ext_id (NOT the human display name — display data is projection-time, not runtime), `{hqIndex}` is the integer index, `{N}` is the post-refill deck length. Empty-deck branch substitutes `(heroDeck empty; slot left null)` for the trailing parenthetical.
  - `// why:` comment on the refill site: "WP-135 — refill the vacated slot from G.heroDeck (FIFO via shift). Empty-deck case leaves the slot null per D-13503; no auto-reshuffle of recruited cards back into the deck (separate engine WP if ever needed)."
  - `// why:` comment on the G.messages push site: "WP-135 — log line is replay-visible and snapshotted; format is locked at this site to byte-equality. Replaces the pre-WP-135 line shape from WP-016 (one push per successful recruit, not two). Never add timestamps or non-deterministic context."

### F) Refill helper — `refillHqSlot`

- **`packages/game-engine/src/board/city.logic.ts`** — additional new export:
  - `refillHqSlot(hq: HqZone, hqIndex: number, heroDeck: CardExtId[]): { hq: HqZone; heroDeck: CardExtId[] }` — pure helper. Returns new arrays; no in-place mutation. When `heroDeck.length === 0`, returns `{ hq: <hq with slot[hqIndex] = null>, heroDeck: [] }`.

### G) Sibling-snapshot extensions — `buildCardStats` + `buildCardDisplayData`

- **`packages/game-engine/src/economy/economy.logic.ts`** — modified:
  - Walk extends to `registry.getSet(setAbbr).heroes[i].cards[j]` for each hero in `config.heroDeckIds`.
  - Each hero card instance gets a cardStats entry keyed by its set-qualified ext_id.
  - Map source: card-level `cost`, `attack`, `recruit` fields (parsed via existing `parseCardStatValue`).
  - JSDoc updated to list "hero card instances" alongside "heroes / villains / mastermind".
- **`packages/game-engine/src/setup/buildCardDisplayData.ts`** — modified:
  - Same walk extension. Each hero card instance gets a display entry with `name` (use `displayName` field if present, else `name`), `imageUrl`, `cost` (via `parseCostNullable`).
  - JSDoc updated.

### H) Projection graduation — close `decks.heroDeckCount` safe-skip

- **`packages/game-engine/src/ui/uiState.build.ts`** — modified:
  - Replace the safe-skip constant `0` for `decks.heroDeckCount` with `gameState.heroDeck.length`.
  - Remove the `// SAFE-SKIP-WP128` marker on that assignment line.
  - Update the projection-section JSDoc to remove `decks.heroDeckCount` from the safe-skip list and decrement the marker-count comment from 8 to 7.

### I) Drift test updates

- **`packages/game-engine/src/ui/uiState.types.drift.test.ts`** — modified:
  - Safe-skip marker count assertion: 8 → 7.
  - New `G.heroDeck` field present in the post-setup state assertion.
  - Existing `decks.heroDeckCount` test now asserts a positive value when the loadout has heroes; the safe-skip-zero assertion is replaced.

### J) Tests

- **`packages/game-engine/src/setup/buildHeroDeck.test.ts`** — new:
  - `buildHeroDeckCards` produces exactly 14 × N cards for N heroes (or whatever total the D-DEC-1 rarity map locks).
  - Each card ext_id is set-qualified per D-DEC-2.
  - `shuffleHeroDeck` differs from sorted insertion order under the canonical `makeMockCtx` (proves shuffle ran).
  - `buildHeroDeck(heroDeckIds, registry, context)` integration test: deterministic output given identical seed + identical inputs.
  - Throws full-sentence Error when a heroDeckId is not found in the registry.
  - Throws full-sentence Error when a hero's `cards[]` is empty.
  - `JSON.stringify(result)` succeeds (serialization proof).
- **`packages/game-engine/src/board/city.logic.test.ts`** — modified:
  - `fillHqFromDeck` fills 5 slots when deck has ≥ 5 cards; remainder count is `len - 5`.
  - `fillHqFromDeck` fills partially and leaves nulls when deck has < 5 cards.
  - `refillHqSlot` shifts one card from deck into the supplied slot; deck length decreases by 1.
  - `refillHqSlot` leaves slot `null` when deck is empty.
  - All tests assert input-array immutability (the supplied `heroDeck` argument is unchanged after the call).
- **`packages/game-engine/src/setup/buildInitialGameState.{shape,loadout,determinism}.test.ts`** — modified (note: `buildInitialGameState` tests are split across three sibling files; place each new test in the most-specific file):
  - `.shape.test.ts` — Post-setup: `G.heroDeck.length === <total hero cards built> - 5`. Post-setup: `G.hq.filter((s) => s !== null).length === 5` (all slots filled). `JSON.stringify(G)` succeeds.
  - `.loadout.test.ts` — Post-setup: every CardExtId in `G.hq` (non-null) has a corresponding entry in `G.cardStats` AND `G.cardDisplayData`. Post-setup: every CardExtId in `G.heroDeck` has corresponding entries in `G.cardStats` AND `G.cardDisplayData`.
  - `.determinism.test.ts` — Order-equality test (per §C acceptance criterion): construct expected post-shuffle deck via the same `ShuffleProvider` mock, run `buildHeroDeck` + `fillHqFromDeck(_, 5)`, assert deep-equal between `G.heroDeck` and `expected.slice(5)`. HQ index-0 first-fill assertions land here as well.
- **`packages/game-engine/src/moves/recruitHero.test.ts`** — modified:
  - `recruitHero` on successful recruit + non-empty heroDeck: vacated slot is refilled with the next deck card; deck length decrements by 1.
  - `recruitHero` on successful recruit + empty heroDeck: vacated slot is `null`; deck stays empty.
  - `G.messages` gains the WP-135 refill log line.
- **`packages/game-engine/src/economy/economy.logic.test.ts`** + **`buildCardDisplayData.test.ts`** — modified:
  - Hero card instances appear in the result with the locked ext_id format and correct cost/attack/recruit/name/imageUrl values.

### K) 01.5 conditional cascade

- **`packages/game-engine/src/replay/replay.execute.test.ts`** — modified ONLY IF the binary procedure detects a hash divergence:
  - Capture `PRE_WP080_HASH` value from line 41 (or wherever the literal lives) **before any edit**.
  - Run `pnpm --filter @legendary-arena/game-engine test` after all production changes land.
  - If the regression-guard test (`replay.execute.test.ts:117 — preserves replayGame stateHash byte-identically`) fails, the post-WP-135 hash differs. Update the literal to the new value at exactly one site with a `// why:` comment citing 01.5 + WP-128 D-12807 + WP-135 ("`G.heroDeck` field added; `recruitHero` `G.messages` line reshaped from the pre-WP-135 WP-016 format; `computeStateHash` input shape changed on both axes").
  - If the test passes byte-identically, the cascade did NOT fire — leave the file untouched and note the no-cascade outcome in the post-mortem (per WP-128 D-12807's no-cascade-with-rationale precedent).

---

## Decision Points (executor locks at session start)

These [DECISION REQUIRED] blocks land in DECISIONS.md as D-13501..D-13503 in numeric order before the first production file is written.

- **D-DEC-1 — Hero rarity → copy-count mapping + unknown-label loud-fail.** Recommended default per Marvel Legendary canonical rules: `Common 1` = 5 copies, `Common 2` = 3, `Uncommon` = 3, `Rare` = 3 (total 14 per hero). Alternatives: source the count from `data/metadata/hero-deck-composition.json` (deferred — no such file exists today); query a registry helper (deferred — no such helper). Lock the hardcoded 5/3/3/3 mapping in `buildHeroDeck.ts` with a `// why:` comment citing D-13501 + the canonical 14-cards-per-hero rule.
  - **Coverage scope:** verified at draft time against `core.json` only. **Cross-set audit (this packet's pre-flight):** 76 of 307 heroes across 40 sets in `data/cards/` (e.g., the entire `amwp.json` set) carry rarity labels `'Common 3'` and `'Uncommon 2'` outside the locked four-label set. Those heroes are **out of scope** for this packet.
  - **Loud-fail lock (Option A):** when `buildHeroDeckCards` encounters a card whose `rarityLabel` is not in `{ 'Common 1', 'Common 2', 'Uncommon', 'Rare' }`, `buildHeroDeck` throws a full-sentence Error citing the offending hero ext_id, the unrecognized `rarityLabel`, and the supported set. Throwing inside `Game.setup()` is the canonical loud-fail surface.
  - **Rejected alternatives:** Option B (extend the rarity map now to `'Common 3'`, `'Uncommon 2'`, etc.) — rejected at MVP because it widens this packet's scope, requires a tabletop-rule citation per AMWP-class set (none yet sourced), and forces test fixtures across the new labels. Silent-skip on unknown labels — rejected because it produces undersized hero decks at runtime with no diagnostic, breaking replay determinism guarantees and the §A acceptance criterion that the deck contains exactly `(rarity-map-sum) × N` cards.
  - **Follow-up:** a Pending engine WP (placeholder `WP-NNN — Extend D-13501 to AMWP-class hero rarity labels`) is recorded in `WORK_INDEX.md`. That WP locks the canonical copy counts for `'Common 3'` / `'Uncommon 2'` / any other observed labels with citations and extends `buildHeroDeck`'s rarity map; until then, MVP loadouts confine `MatchSetupConfig.heroDeckIds` to compliant sets.

- **D-DEC-2 — Hero card instance ext_id format.** Recommended default per D-10014 set-qualification: `<setAbbr>/<heroSlug>/<cardSlug>` (e.g., `core/spider-man/astonishing-strength`). Alternatives: `<setAbbr>/<heroSlug>/<rarityLabel>/<cardSlug>` (more drift-resistant if two hero cards ever share a slug across rarities). Rejected at MVP because (a) registry data guarantees hero-scoped uniqueness today — no observed collisions across all 40 sets in `data/cards/`; (b) introducing rarity into the ext_id would prematurely fragment the sibling-snapshot maps (`G.cardStats`, `G.cardDisplayData`) by adding a synthetic key segment that has no upstream registry-side authority, complicating every future card-data join across `cardStats[extId]` / `cardDisplayData[extId]` / `villainDeckCardTypes[extId]` / `cardKeywords[extId]` for zero observed benefit; (c) future-proofing against a hypothetical collision is properly handled by extending the registry's hero-card schema with a stable disambiguator field, not by overloading the ext_id surface. Lock at D-13502 with a sample ext_id and the canonical join key.

- **D-DEC-3 — Empty-deck recruit behavior.** Recommended default: vacated slot stays `null`; no auto-reshuffle of recruited cards back into the deck. Alternatives: error out the recruit (rejected — recruit was successful from the engine's POV; the empty-deck state is post-success); reshuffle the active player's discard into the heroDeck (rejected — that's the player's deck, not the shared hero pool; would conflate per-player and shared zones). Lock at D-13503.

---

## Out of Scope

- No new HQ slot count beyond 5 (D-12903 graceful-extension to 6 is a separate concern handled at the wireframe / client layer).
- No multi-set heroes per loadout beyond what `MatchSetupConfig.heroDeckIds` supplies.
- No "sidekick replacement" mechanic (where Sidekicks substitute for one hero card per turn — that's a separate Legendary mechanic encoded by some scenarios).
- No mid-match hero swap or rotation.
- No closing of the OTHER seven WP-128 D-12806 safe-skip sites (`mastermind.attachedBystanders`, `mastermind.strikePile`, `scheme.twistPile`, `city.escapedPile`, `economy.piercing`, `economy.woundsDrawn`, `piles.horrorsCount`) — each closes in its own future engine WP.
- No client-side change in this packet. WP-129's `<HQRow>` and `<TopHudBar>` consume the projection unchanged; only their fixture / test inputs need to graduate from the safe-skip-zero shape if any test pinned the constant `0`.
- No registry modifications.
- No server modifications.
- No `recruitHero` cost-economy changes (WP-018 + WP-016 cost-deduction is the locked contract; WP-135 only adds the post-success refill step).
- Refactors / cleanups / "while I'm here" improvements are **out of scope**.

---

## Files Expected to Change

**New files (3):**
- `packages/game-engine/src/setup/buildHeroDeck.ts` — new
- `packages/game-engine/src/setup/buildHeroDeck.test.ts` — new
- (optionally `packages/game-engine/src/board/city.logic.test.ts` — modified rather than new; existing test file)

**Modified (engine — 9):**
- `packages/game-engine/src/types.ts` — `heroDeck: CardExtId[]` field
- `packages/game-engine/src/setup/buildInitialGameState.ts` — call buildHeroDeck + fillHqFromDeck; update line 308-309 comment
- `packages/game-engine/src/economy/economy.logic.ts` — extend walk to hero card instances
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — extend walk to hero card instances
- `packages/game-engine/src/board/city.logic.ts` — add `fillHqFromDeck` + `refillHqSlot` exports
- `packages/game-engine/src/moves/recruitHero.ts` — refill slot on success
- `packages/game-engine/src/ui/uiState.build.ts` — graduate `decks.heroDeckCount` from safe-skip 0 to `gameState.heroDeck.length`; remove the `// SAFE-SKIP-WP128` marker
- `packages/game-engine/src/index.ts` — export `buildHeroDeck` + `fillHqFromDeck` + `refillHqSlot` + (re-export `LegendaryGameState['heroDeck']` typing if downstream needs it)
- `packages/game-engine/src/replay/replay.execute.test.ts` — 01.5 conditional cascade (only if hash diverges)

**Modified (tests — 5):**
- `packages/game-engine/src/board/city.logic.test.ts` — new helper coverage
- `packages/game-engine/src/setup/buildInitialGameState.shape.test.ts` — post-setup heroDeck/hq counts + JSON.stringify
- `packages/game-engine/src/setup/buildInitialGameState.loadout.test.ts` — every hq/heroDeck CardExtId has cardStats + cardDisplayData entries
- `packages/game-engine/src/setup/buildInitialGameState.determinism.test.ts` — order-equality + HQ index-0 first-fill
- `packages/game-engine/src/economy/economy.logic.test.ts` — hero card instances
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts` — hero card instances
- `packages/game-engine/src/moves/recruitHero.test.ts` — refill behavior + empty-deck behavior
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — safe-skip count 8 → 7; new field pinned

**Governance (4):**
- `docs/ai/STATUS.md` — `### WP-135 / EC-138 Executed` block
- `docs/ai/DECISIONS.md` — D-13501..D-13503 inserted in numeric order
- `docs/ai/work-packets/WORK_INDEX.md` — WP-135 row checked off + commit hash
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-138 row Draft → Done

**Post-mortem (1):**
- `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md` — MANDATORY (new long-lived `G` field; new contract surface)

**Total projected:** ~24 files (2 new production + 1 new test + 9 modified production + 8 modified test [city.logic.test, buildInitialGameState.{shape,loadout,determinism}.test, economy.logic.test, buildCardDisplayData.test, recruitHero.test, uiState.types.drift.test] + 4 governance + 1 post-mortem; 01.5 cascade adds a 25th if it fires).

---

## Acceptance Criteria

### A — `G` field

- [ ] `LegendaryGameState` exposes `heroDeck: CardExtId[]`.
- [ ] Post-setup, `JSON.stringify(G)` succeeds and includes the `heroDeck` array.

### B — `buildHeroDeck`

- [ ] `buildHeroDeck.ts` exports `buildHeroDeck`, `buildHeroDeckCards`, `shuffleHeroDeck`.
- [ ] Given the locked rarity map (D-13501) and a 4-hero loadout from `data/cards/core.json`, the unshuffled deck has exactly 56 cards (4 × 14) — or whatever the locked map computes.
- [ ] No `boardgame.io` import.
- [ ] No `Math.random` use.
- [ ] `buildHeroDeck` throws a full-sentence Error when given a hero whose `cards[]` carries a `rarityLabel` outside `{ 'Common 1', 'Common 2', 'Uncommon', 'Rare' }` (D-13501 Option A loud-fail). The Error message names the offending hero ext_id, the unrecognized label, and the supported four-label set. Tests in `buildHeroDeck.test.ts` exercise this branch with a synthetic registry mock that emits `'Common 3'` (no real card data is required to drive the test).

### C — Setup orchestration

- [ ] After `buildInitialGameState`, `G.hq.filter((s) => s !== null).length === 5`.
- [ ] After `buildInitialGameState`, `G.heroDeck.length === <total hero cards> - 5`.
- [ ] Every CardExtId in `G.hq` (non-null) has entries in `G.cardStats` AND `G.cardDisplayData`.
- [ ] Every CardExtId in `G.heroDeck` has entries in `G.cardStats` AND `G.cardDisplayData`.
- [ ] The original "WP-016 scope" comment at line 308-309 is removed; the new comment cites WP-135.
- [ ] **Order-semantics lock:** the post-setup `G.heroDeck` array equals the post-shuffle deck array with the first 5 cards removed (`shuffledDeck.slice(5)`). Tests construct the expected deck via the same `ShuffleProvider` mock, run `buildHeroDeck` + `fillHqFromDeck(_, 5)`, and assert deep-equal between `G.heroDeck` and `expected.slice(5)`. Single-shuffle, FIFO-prefix-pop is the only permitted construction path; any deviation (re-sort, re-shuffle, partition-and-merge) violates the determinism envelope.

### D — HQ refill on recruit

- [ ] `recruitHero` on a non-null HQ slot with `G.heroDeck.length > 0`: the slot is replaced by the next deck card; `G.heroDeck.length` decrements by 1.
- [ ] `recruitHero` on a non-null HQ slot with `G.heroDeck.length === 0`: the slot is set to `null`; `G.heroDeck` stays empty.
- [ ] `G.messages` gains exactly **one** line per successful `recruitHero` (the WP-135 locked format, replacing the pre-WP-135 WP-016 push). Tests assert byte-identical match against the locked format and that the count of new `G.messages` entries per recruit is `1`, not `2`.
- [ ] No new `throw` statements in `recruitHero.ts` (move-as-no-throw contract preserved).

### E — UIState projection graduation

- [ ] `decks.heroDeckCount` projects `gameState.heroDeck.length` (no longer constant `0`).
- [ ] `// SAFE-SKIP-WP128` marker count drops from 8 to 7.
- [ ] Drift test asserts the new marker count exactly.

### F — D-13501..D-13503

- [ ] Three new entries inserted in `DECISIONS.md` in numeric order with rationale + rejected alternatives.
- [ ] `buildHeroDeck.ts` cites D-13501 at the rarity-map declaration site.
- [ ] `buildHeroDeck.ts` cites D-13502 at the ext_id-construction site.
- [ ] `recruitHero.ts` cites D-13503 at the empty-deck branch.

### G — Tests

- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0.
- [ ] Engine baseline `621 / 135 / 0` → projected `621+N / 135+M / 0` with N+M ∈ [13, 26] new tests (band widened by +1 vs draft to cover the throw-on-unknown-rarityLabel test from D-13501 Option A).

### H — 01.5 cascade

- [ ] `PRE_WP080_HASH` literal updated IFF post-edit hash differs from pre-edit; `// why:` comment cites 01.5 + D-12807 + WP-135 at the update site.
- [ ] Or, if no cascade, the post-mortem documents the no-cascade outcome with rationale.

### Scope Enforcement

- [ ] No client / server / registry / preplan / vue-sfc-loader files modified (verified with `git diff --name-only`).
- [ ] No `.claude/rules/*.md` files modified.
- [ ] No `MatchSetupConfig` field added or removed.

---

## Verification Steps

```pwsh
# Step 1 — full engine build
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0

# Step 2 — engine tests
pnpm --filter @legendary-arena/game-engine test
# Expected: 621+N / 135+M / 0 with N+M in [13, 26] (the +1 vs the prior [12, 25] band covers the new throw-on-unknown-rarityLabel test mandated by D-13501 Option A loud-fail)

# Step 3 — confirm no Math.random in new files
Select-String -Path "packages\game-engine\src\setup\buildHeroDeck.ts" -Pattern "Math\.random"
# Expected: no output

# Step 4 — confirm no boardgame.io import in pure helpers
Select-String -Path "packages\game-engine\src\setup\buildHeroDeck.ts","packages\game-engine\src\board\city.logic.ts" -Pattern "from ['""]boardgame\.io" -Recurse
# Expected: no output

# Step 5 — confirm SAFE-SKIP-WP128 marker count drops to 7
Select-String -Path "packages\game-engine\src\ui\uiState.build.ts" -Pattern "SAFE-SKIP-WP128"
# Expected: 7 matches at assignment sites + the JSDoc-header reference (count down from 8+1 to 7+1)

# Step 6 — confirm D-13501..D-13503 cited at the locked sites
Select-String -Path "packages\game-engine\src\setup\buildHeroDeck.ts" -Pattern "D-13501|D-13502"
Select-String -Path "packages\game-engine\src\moves\recruitHero.ts" -Pattern "D-13503"
# Expected: at least 1 match per site

# Step 7 — confirm 01.5 cascade outcome
git diff packages/game-engine/src/replay/replay.execute.test.ts
# Expected: either empty (no cascade) OR a single-line PRE_WP080_HASH literal update with a // why: comment

# Step 8 — confirm scope-locked files unchanged
git diff --name-only apps/ packages/registry packages/preplan packages/vue-sfc-loader .claude/rules
# Expected: no output

# Step 9 — manual smoke (optional — local server)
# Start server via Start-SmokeTest.ps1, create a 2-player match with the same
# loadout the user used during WP-129 testing. Confirm: 5 HQ slots populated
# with hero cards at match start; Hero Deck shows [N] (e.g., [51] for a
# 4-hero × 14-card deck minus 5 in HQ); recruiting a hero on the active
# player's turn refills the slot from the deck; deck count decrements.
```

---

## Vision Alignment

§3 (Player Trust & Fairness): preserved — the shuffle is deterministic per match seed; replay reproduces the exact deck order. §4 (Faithful Multiplayer Experience): aligned — closes the gap that made the engine's shipped state structurally unwinnable; matches Marvel Legendary canonical rules for hero deck composition (D-DEC-1). §10 (Content as Data): aligned — hero card instances flow through the registry walk; no card data is hardcoded. §11 (Stateless Client Philosophy): aligned — `decks.heroDeckCount` graduates from a constant safe-skip to a projection of authoritative G state without any client-side change. §14 (Explicit Decisions, No Silent Drift): preserved — D-13501..D-13503 land in DECISIONS.md; the rarity map, ext_id format, and empty-deck behavior are surfaced rather than implied. NG-1 (no monetization): not crossed. NG-3 (no engine network): preserved (engine never modified for network access). NG-6 (deterministic engine): preserved (`ctx.random.Shuffle` only).

**§20 Funding Surface Gate: N/A** with explicit justification (gameplay-logic surface; no funding-adjacent UI or copy).
**§21 API Catalog: N/A** (no `apps/server/**` files touched).

**Determinism preservation:** the new `G.heroDeck` field is built once at setup via `ctx.random.Shuffle`; subsequent `recruitHero` mutations are the only post-setup writes and are deterministic (single `shift()`-equivalent pop per move). Replay reproduction is byte-identical.

---

## Definition of Done

- [ ] All §Acceptance Criteria pass.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; baseline grows by [12, 25] tests.
- [ ] D-13501..D-13503 inserted in `DECISIONS.md` in numeric order.
- [ ] STATUS.md `### WP-135 / EC-138 Executed` block at top of `## Current State`.
- [ ] WORK_INDEX.md WP-135 row checked off with date + commit hash.
- [ ] EC_INDEX.md EC-138 row flipped Draft → Done.
- [ ] 01.6 post-mortem authored at `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md`.
- [ ] 01.5 conditional cascade outcome recorded (cascade fired with literal update OR no cascade with rationale).
- [ ] Single `EC-138:` commit (or two if 01.5 cascade is split per the WP-111 / EC-118 two-commit topology precedent) with the locked file count.
