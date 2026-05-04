# EC-138 — HQ Population & Hero Deck Reservoir (Execution Checklist)

**Source:** docs/ai/work-packets/WP-135-hq-population-and-hero-deck-reservoir.md
**Layer:** Game Engine — Setup + State + Moves (`packages/game-engine/src/setup/`, `packages/game-engine/src/board/`, `packages/game-engine/src/moves/`, `packages/game-engine/src/types.ts`, `packages/game-engine/src/ui/`)

**Execution Authority:** This EC is the authoritative execution checklist for WP-135. Implementation must satisfy every clause exactly. Failure to satisfy any item below is a failed execution of WP-135.

---

## §0 — Pre-Flight

- [ ] WP-016 / WP-018 / WP-111 / WP-128 / WP-129 complete (`recruitHero` move; `G.cardStats`; `G.cardDisplayData`; `UIDecksState.heroDeckCount` projection; client-side HQ + Hero Deck consumers).
- [ ] Engine baseline `621 / 135 / 0` at HEAD (post WP-129 / EC-132).
- [ ] `data/cards/<setAbbr>.json` exposes hero `cards: []` arrays with `rarityLabel` ∈ `{ 'Common 1', 'Common 2', 'Uncommon', 'Rare' }` (verified against `data/cards/core.json` at draft time + cross-set audited at pre-flight 2026-05-04: 76/307 heroes across 40 sets — e.g., entire `amwp.json` — use `'Common 3'` / `'Uncommon 2'` outside the locked four-label set, deferred to a follow-up WP per D-13501 Option A loud-fail lock).
- [ ] D-13501..D-13503 locked in DECISIONS.md before the first production file is written. D-13501 includes the **Option A loud-fail clause:** `buildHeroDeck` throws on unknown `rarityLabel` rather than silent-skip or silent-zero-copies.
- [ ] MVP loadout authored for execution confines `MatchSetupConfig.heroDeckIds` to compliant sets (currently: `core.json`); cross-set support is deferred to the Pending follow-up WP recorded in `WORK_INDEX.md`.

## §1 — Locked Values (do not re-derive)

- **HQ slot count (MVP):** 5.
- **HQ index semantics:** index `0` is the deterministic first-fill slot at setup AND on refill. Deck top (post-shuffle, position 0) lands at HQ slot 0. Tests assert: `heroDeck.length >= 1 → hq[0] !== null`; `heroDeck.length >= 5 → hq[0..4]` are non-null in deck-front order.
- **PlayerZones keys:** `deck` | `hand` | `discard` | `inPlay` | `victory`.
- **Phase / stage names:** phases `'lobby'` | `'setup'` | `'play'` | `'end'`; stages `'start'` | `'main'` | `'cleanup'`.
- **Hero card instance ext_id format (D-13502):** `<setAbbr>/<heroSlug>/<cardSlug>` (e.g., `core/spider-man/astonishing-strength`).
- **Rarity → copy-count mapping (D-13501; recommended default):** Common 1 = 5; Common 2 = 3; Uncommon = 3; Rare = 3 (sum = 14 per hero). **Coverage scope:** the four-label set `{ 'Common 1', 'Common 2', 'Uncommon', 'Rare' }`. Any hero card whose `rarityLabel` falls outside this set causes `buildHeroDeck` to throw a full-sentence Error (D-13501 Option A loud-fail) inside `Game.setup()`. Cross-set extension (e.g., `'Common 3'`, `'Uncommon 2'` observed in `amwp.json`) is deferred to a Pending follow-up WP.
- **Empty-deck recruit behavior (D-13503):** vacated slot stays `null`; no auto-reshuffle.
- **`G.messages` recruit log format (locked byte-for-byte):** `"Player {playerId} recruited {heroExtId}; HQ slot {hqIndex} refilled from heroDeck (heroDeck.length: {N})"`. Empty-deck branch substitutes `(heroDeck empty; slot left null)` for the trailing parenthetical. No timestamps, no wall-clock data, no debug context. Replay diffs depend on byte-equality.
- **Safe-skip marker count after this packet:** 7 (was 8; this packet closes `decks.heroDeckCount`).

## §2 — Guardrails

- `buildHeroDeck.ts` is a pure helper: no `boardgame.io` import; no `Math.random`; no I/O.
- `G.heroDeck` is a CardExtId-strings-only array — never card objects.
- `recruitHero.ts` is the SOLE post-setup mutator of `G.heroDeck`. Any other mutation is a violation.
- HQ refill on recruit uses a pure helper (`refillHqSlot`); no inline `splice` / `shift` in the move body.
- The shuffle uses `ctx.random.Shuffle` exclusively. Never `Math.random()`.
- `G.heroDeck` and `G.hq` mutations return new arrays; no in-place mutation. Helpers in `city.logic.ts` (`fillHqFromDeck`, `refillHqSlot`) build new arrays and the orchestrator / move body rebinds `G.heroDeck = newArray` — never `G.heroDeck.push()` / `.shift()` / `.splice()` directly.
- **Determinism Envelope (must not be widened):** exactly one `ctx.random.Shuffle` call at setup; HQ population is a deterministic prefix pop (FIFO from index 0) with no re-sort, re-shuffle, partition, or rearrangement; `recruitHero` performs a single front-pop per success — no batching, no replacement, no auto-reshuffle of recruited cards back into the deck. The registry walk in `buildHeroDeckCards` is ordering-stable (heroes per `config.heroDeckIds` order, cards per registry `cards[]` order, copies per rarity-map order). Refactors that "preserve test pass" but widen this envelope (per-turn shuffle, batched front-pops, deck sorting) are forbidden — they break replay determinism. The replay-hash regression guard is the canary.
- `decks.heroDeckCount` projection graduates at exactly one site in `uiState.build.ts`; the `// SAFE-SKIP-WP128` marker is removed on that line.
- Move-as-no-throw contract preserved: no new `throw` statements in `recruitHero.ts`.
- `G.messages` recruit log format is locked byte-for-byte at the §1 string. Future "helpful" additions (timestamps, debug context, formatted dates) silently break replay diffs and are forbidden.
- `recruitHero` produces **exactly ONE** `G.messages` push per successful recruit, in the WP-135 locked format. The pre-WP-135 push from WP-016 (`recruitHero.ts:76-78`, format `"Player {playerId} recruited \"{cardId}\" from HQ slot {hqIndex}."`) is **replaced**, not augmented. Tests assert the count of new `G.messages` entries per recruit equals `1`.
- `buildHeroDeck` throws (D-13501 Option A loud-fail) on unknown `rarityLabel` with a full-sentence Error message that names the offending hero ext_id, the unrecognized label, and the supported four-label set. Throw site lives in `buildHeroDeck.ts` (or its `buildHeroDeckCards` helper); no other call path may swallow the error.
- 01.5 conditional cascade: capture `PRE_WP080_HASH` before any edit; update only on hash divergence; cite 01.5 + D-12807 + WP-135 at the update site.
- 01.6 post-mortem MANDATORY (new long-lived `G` field; new contract surface).

## §3 — Required `// why:` Comments

- `types.ts` — `heroDeck` field declaration: cite WP-135 + WP-014B sibling pattern + WP-128 D-12806 closure.
- `buildHeroDeck.ts` — rarity-to-copy-count map declaration: cite D-13501 with the canonical 14-cards-per-hero rule.
- `buildHeroDeck.ts` — ext_id construction site: cite D-13502.
- `buildHeroDeck.ts` — `ctx.random.Shuffle` call site: cite WP-135 determinism guarantee.
- `buildHeroDeck.ts` — unknown-rarityLabel throw site: cite D-13501 Option A loud-fail + the deferred follow-up WP for cross-set rarity support.
- `buildInitialGameState.ts` — replace the obsolete "WP-016 scope" comment with one citing WP-135 + the HQ-from-first-5 + remainder-stored-at-G.heroDeck pattern.
- `city.logic.ts` — `fillHqFromDeck` declaration: cite the engine entry-edge pattern (slot 0 fills first; mirrors `pushVillainIntoCity`).
- `recruitHero.ts` — refill site: cite WP-135 + the FIFO-via-shift behavior.
- `recruitHero.ts` — empty-deck branch: cite D-13503 (slot stays null; no auto-reshuffle).
- `recruitHero.ts` — `G.messages` push site: cite WP-135 + the byte-for-byte format lock + that this REPLACES the pre-WP-135 WP-016 line shape (one push per successful recruit, not two).
- `uiState.build.ts` — graduation of `decks.heroDeckCount`: cite WP-135 closing the WP-128 D-12806 safe-skip site.
- `replay.execute.test.ts` — 01.5 cascade hash literal update (only if cascade fired): cite 01.5 + D-12807 + WP-135 with both inputs ("`G.heroDeck` field added; `recruitHero` `G.messages` line reshaped from the pre-WP-135 WP-016 format; `computeStateHash` input shape changed on both axes").

## §4 — Files to Produce

**New (3):**
- `packages/game-engine/src/setup/buildHeroDeck.ts` — new — registry walk + rarity-driven flat array + `ctx.random.Shuffle`
- `packages/game-engine/src/setup/buildHeroDeck.test.ts` — new — coverage for the new helpers + serialization proof + invalid-input throws

**Modified (production — 8):**
- `packages/game-engine/src/types.ts` — add `heroDeck: CardExtId[]` to `LegendaryGameState`
- `packages/game-engine/src/setup/buildInitialGameState.ts` — call `buildHeroDeck`; fill HQ via `fillHqFromDeck`; replace obsolete comment
- `packages/game-engine/src/economy/economy.logic.ts` — extend walk to hero card instances
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — extend walk to hero card instances
- `packages/game-engine/src/board/city.logic.ts` — add `fillHqFromDeck` + `refillHqSlot` exports
- `packages/game-engine/src/moves/recruitHero.ts` — refill slot on success; D-13503 empty-deck branch; G.messages line
- `packages/game-engine/src/ui/uiState.build.ts` — graduate `decks.heroDeckCount`; remove safe-skip marker
- `packages/game-engine/src/index.ts` — export new helpers

**Modified (tests — 8):**
- `packages/game-engine/src/board/city.logic.test.ts`
- `packages/game-engine/src/setup/buildInitialGameState.shape.test.ts` — heroDeck/hq counts + JSON.stringify
- `packages/game-engine/src/setup/buildInitialGameState.loadout.test.ts` — every hq/heroDeck CardExtId has cardStats + cardDisplayData entries
- `packages/game-engine/src/setup/buildInitialGameState.determinism.test.ts` — order-equality + HQ index-0 first-fill
- `packages/game-engine/src/economy/economy.logic.test.ts`
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts`
- `packages/game-engine/src/moves/recruitHero.test.ts`
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — safe-skip count 8 → 7; new field pinned

(Note: the WP draft listed "`buildInitialGameState.test.ts`" as a single file; the actual codebase splits these tests into the three sibling files above. Place each new test in the most-specific file. No test-file consolidation is in scope for this packet.)

**01.5 cascade (conditional — 1):**
- `packages/game-engine/src/replay/replay.execute.test.ts` — `PRE_WP080_HASH` literal update IFF cascade fires

**Governance (4):**
- `docs/ai/STATUS.md` — `### WP-135 / EC-138 Executed` block
- `docs/ai/DECISIONS.md` — D-13501..D-13503 in numeric order
- `docs/ai/work-packets/WORK_INDEX.md` — WP-135 row checked off + commit hash
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-138 row Draft → Done

**Post-mortem (1):**
- `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md` — MANDATORY

## §5 — Verification Gates

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; baseline grows by [13, 26] tests (band widened by +1 vs draft to cover the throw-on-unknown-rarityLabel test from D-13501 Option A).
- [ ] `Select-String -Path "packages\game-engine\src\setup\buildHeroDeck.ts" -Pattern "Math\.random"` returns no output.
- [ ] `Select-String -Path "packages\game-engine\src\setup\buildHeroDeck.ts","packages\game-engine\src\board\city.logic.ts" -Pattern "from ['""]boardgame\.io" -Recurse` returns no output.
- [ ] `Select-String -Path "packages\game-engine\src\ui\uiState.build.ts" -Pattern "SAFE-SKIP-WP128"` shows the marker count drop (was 8 assignment-site matches; now 7).
- [ ] D-13501..D-13503 cited at the locked sites (per §3).
- [ ] `git diff packages/game-engine/src/replay/replay.execute.test.ts` is empty (no cascade) OR a single-line `PRE_WP080_HASH` literal update with a `// why:` comment.
- [ ] `git diff --name-only apps/ packages/registry packages/preplan packages/vue-sfc-loader .claude/rules` returns no output.
- [ ] **Order-equality test present:** at least one test in `buildInitialGameState.determinism.test.ts` constructs the expected post-shuffle deck via the same `ShuffleProvider` mock used by setup, then asserts deep-equal between `G.heroDeck` and `expectedShuffledDeck.slice(5)`. This locks the single-shuffle + FIFO-prefix-pop construction path against silent envelope-widening.
- [ ] **HQ index-0 first-fill test present:** at least one test in `buildInitialGameState.determinism.test.ts` asserts `G.hq[0] !== null` whenever `heroDeck.length >= 1` post-setup; another asserts `G.hq[0..4]` are all non-null in deck-front order whenever `heroDeck.length >= 5`.
- [ ] **Unknown-rarityLabel throw test present:** at least one test in `buildHeroDeck.test.ts` invokes `buildHeroDeck` with a synthetic registry mock that emits a hero whose `cards[]` contains a `rarityLabel` outside `{ 'Common 1', 'Common 2', 'Uncommon', 'Rare' }` (e.g., `'Common 3'`) and asserts that a full-sentence Error is thrown naming the offending hero ext_id, the unrecognized label, and the supported four-label set (D-13501 Option A loud-fail).
- [ ] **One-G.messages-push-per-recruit test present:** at least one test in `recruitHero.test.ts` asserts that successful `recruitHero` produces exactly **one** new entry in `G.messages` (not two), in the WP-135 locked format. The pre-WP-135 WP-016 line shape is GONE.
- [ ] Manual smoke (recommended): start the smoke-test server, create a 2-player match, confirm 5 HQ slots are populated at match start; recruit one hero on the active player's turn; confirm the slot refills from the deck and `decks.heroDeckCount` decrements by 1; confirm the `G.messages` log line matches the locked format byte-for-byte (no timestamps, no extra context).

## §6 — Commit Hygiene

- [ ] Commit prefix: `EC-138:`. Code under `packages/game-engine/` is staged → `SPEC:` prefix forbidden per `01.3` Rule 5.
- [ ] Vision trailer: `Vision: §3, §4, §10, §11, §14, NG-1, NG-3, NG-6` per `01.3` convention.
- [ ] No `--no-verify`, no `--no-gpg-sign`.
- [ ] Two-commit topology if 01.5 cascade fires (mirrors WP-111 / EC-118 precedent): A `EC-138:` for production + the cascade literal update; B `SPEC:` for governance close (STATUS / DECISIONS / WORK_INDEX / EC_INDEX / post-mortem).

## §7 — Post-Execution Checks

- [ ] All WP-135 §Acceptance Criteria pass.
- [ ] D-13501..D-13503 entries with rationale + rejected alternatives.
- [ ] 01.6 post-mortem authored at `docs/ai/post-mortems/01.6-WP-135-hq-population-and-hero-deck-reservoir.md`.
- [ ] STATUS.md execution block cites the three decisions + the safe-skip closure (8 → 7) + the 01.5 cascade outcome (fired or not).
- [ ] WORK_INDEX.md WP-135 row checked off with date + commit hash.
- [ ] EC_INDEX.md EC-138 row flipped Draft → Done {YYYY-MM-DD}.

## Common Failure Smells

- `<unknown>` showing in HQ at match start → `buildCardStats` and/or `buildCardDisplayData` walk did not extend to hero card instances; check the registry walk in §4 modifications.
- HQ slots all `null` after setup → `fillHqFromDeck` was added but `buildInitialGameState.ts` still calls `initializeHq()`; the orchestrator's HQ assignment must swap to the new helper.
- `decks.heroDeckCount` still projects `0` post-setup → the safe-skip constant wasn't replaced in `uiState.build.ts:projectDecks`; check the marker-count grep gate dropped from 8 to 7.
- Engine baseline shows fewer tests than `[621+13, 621+26]` → some required test additions were skipped; check §4 modified test files.
- `buildHeroDeck.test.ts` unknown-rarityLabel test does NOT exist → D-13501 Option A loud-fail not exercised; add the synthetic-mock test that asserts the full-sentence Error.
- `recruitHero` test still asserts the pre-WP-135 message format (`"Player N recruited "X" from HQ slot Y."`) → the WP-135 locked format must replace it, not be added alongside. Update the assertion value-only.
- `G.messages` shows TWO entries per successful recruit → the WP-016 push at `recruitHero.ts:76-78` was not removed when the WP-135 push was added. Replace, do not augment.
- 01.5 cascade test fails on `replay.execute.test.ts:117` → expected per WP-128 D-12807; capture the post-edit hash and update the literal at exactly one site with the cited `// why:` comment.
- `recruitHero` test fails on the empty-deck branch → check D-13503 site; the slot must be set to `null`, not the prior recruited card or a stale value.
- Drift test fails on safe-skip count → forgot to decrement from 8 to 7 in the drift assertion.
- New `throw` statement in `recruitHero.ts` → move-as-no-throw contract violated; refactor the empty-deck branch to return-void rather than throw.
- Replay-hash test fails AND no 01.5 cascade in `git diff replay.execute.test.ts` → determinism envelope was widened (extra shuffle, deck reorder, batched pop, registry-walk reorder). Revert the envelope-widening change; the 01.5 cascade is only legitimate when the new `G` field itself changed `computeStateHash`, not when the envelope was silently extended.
- `G.messages` recruit line contains a timestamp, formatted date, debug payload, or otherwise differs from the §1 locked format string → replay diff loses byte-equality. Revert to the locked format; if a richer log surface is genuinely needed, that's a separate WP that updates `G.messages` semantics globally.
- HQ slot 0 is `null` while `G.heroDeck.length > 0` → HQ index-0 first-fill semantics violated. The orchestrator's `fillHqFromDeck` call probably popped from the wrong end (back-pop instead of front-pop) or the HQ assignment swapped slot ordering.
