# EC-138 — HQ Population & Hero Deck Reservoir (Execution Checklist)

**Source:** docs/ai/work-packets/WP-135-hq-population-and-hero-deck-reservoir.md
**Layer:** Game Engine — Setup + State + Moves (`packages/game-engine/src/setup/`, `packages/game-engine/src/board/`, `packages/game-engine/src/moves/`, `packages/game-engine/src/types.ts`, `packages/game-engine/src/ui/`)

**Execution Authority:** This EC is the authoritative execution checklist for WP-135. Implementation must satisfy every clause exactly. Failure to satisfy any item below is a failed execution of WP-135.

---

## §0 — Pre-Flight

- [ ] WP-016 / WP-018 / WP-111 / WP-128 / WP-129 complete (`recruitHero` move; `G.cardStats`; `G.cardDisplayData`; `UIDecksState.heroDeckCount` projection; client-side HQ + Hero Deck consumers).
- [ ] Engine baseline `621 / 135 / 0` at HEAD (post WP-129 / EC-132).
- [ ] `data/cards/<setAbbr>.json` exposes hero `cards: []` arrays with `rarityLabel` ∈ `{ 'Common 1', 'Common 2', 'Uncommon', 'Rare' }` (verified against `data/cards/core.json` at draft time).
- [ ] D-13501..D-13503 locked in DECISIONS.md before the first production file is written.

## §1 — Locked Values (do not re-derive)

- **HQ slot count (MVP):** 5.
- **PlayerZones keys:** `deck` | `hand` | `discard` | `inPlay` | `victory`.
- **Phase / stage names:** phases `'lobby'` | `'setup'` | `'play'` | `'end'`; stages `'start'` | `'main'` | `'cleanup'`.
- **Hero card instance ext_id format (D-13502):** `<setAbbr>/<heroSlug>/<cardSlug>` (e.g., `core/spider-man/astonishing-strength`).
- **Rarity → copy-count mapping (D-13501; recommended default):** Common 1 = 5; Common 2 = 3; Uncommon = 3; Rare = 3 (sum = 14 per hero).
- **Empty-deck recruit behavior (D-13503):** vacated slot stays `null`; no auto-reshuffle.
- **Safe-skip marker count after this packet:** 7 (was 8; this packet closes `decks.heroDeckCount`).

## §2 — Guardrails

- `buildHeroDeck.ts` is a pure helper: no `boardgame.io` import; no `Math.random`; no I/O.
- `G.heroDeck` is a CardExtId-strings-only array — never card objects.
- `recruitHero.impl.ts` is the SOLE post-setup mutator of `G.heroDeck`. Any other mutation is a violation.
- HQ refill on recruit uses a pure helper (`refillHqSlot`); no inline `splice` / `shift` in the move body.
- The shuffle uses `ctx.random.Shuffle` exclusively. Never `Math.random()`.
- `G.heroDeck` and `G.hq` mutations return new arrays; no in-place mutation outside zoneOps.
- `decks.heroDeckCount` projection graduates at exactly one site in `uiState.build.ts`; the `// SAFE-SKIP-WP128` marker is removed on that line.
- Move-as-no-throw contract preserved: no new `throw` statements in `recruitHero.impl.ts`.
- 01.5 conditional cascade: capture `PRE_WP080_HASH` before any edit; update only on hash divergence; cite 01.5 + D-12807 + WP-135 at the update site.
- 01.6 post-mortem MANDATORY (new long-lived `G` field; new contract surface).

## §3 — Required `// why:` Comments

- `types.ts` — `heroDeck` field declaration: cite WP-135 + WP-014B sibling pattern + WP-128 D-12806 closure.
- `buildHeroDeck.ts` — rarity-to-copy-count map declaration: cite D-13501 with the canonical 14-cards-per-hero rule.
- `buildHeroDeck.ts` — ext_id construction site: cite D-13502.
- `buildHeroDeck.ts` — `ctx.random.Shuffle` call site: cite WP-135 determinism guarantee.
- `buildInitialGameState.ts` — replace the obsolete "WP-016 scope" comment with one citing WP-135 + the HQ-from-first-5 + remainder-stored-at-G.heroDeck pattern.
- `city.logic.ts` — `fillHqFromDeck` declaration: cite the engine entry-edge pattern (slot 0 fills first; mirrors `pushVillainIntoCity`).
- `recruitHero.impl.ts` — refill site: cite WP-135 + the FIFO-via-shift behavior.
- `recruitHero.impl.ts` — empty-deck branch: cite D-13503 (slot stays null; no auto-reshuffle).
- `uiState.build.ts` — graduation of `decks.heroDeckCount`: cite WP-135 closing the WP-128 D-12806 safe-skip site.
- `replay.execute.test.ts` — 01.5 cascade hash literal update (only if cascade fired): cite 01.5 + D-12807 + WP-135.

## §4 — Files to Produce

**New (3):**
- `packages/game-engine/src/setup/buildHeroDeck.ts` — new — registry walk + rarity-driven flat array + `ctx.random.Shuffle`
- `packages/game-engine/src/setup/buildHeroDeck.test.ts` — new — coverage for the new helpers + serialization proof + invalid-input throws

**Modified (production — 8):**
- `packages/game-engine/src/types.ts` — add `heroDeck: CardExtId[]` to `LegendaryGameState`
- `packages/game-engine/src/setup/buildInitialGameState.ts` — call `buildHeroDeck`; fill HQ via `fillHqFromDeck`; replace obsolete comment
- `packages/game-engine/src/setup/buildCardStats.ts` — extend walk to hero card instances
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — extend walk to hero card instances
- `packages/game-engine/src/board/city.logic.ts` — add `fillHqFromDeck` + `refillHqSlot` exports
- `packages/game-engine/src/moves/recruitHero.impl.ts` — refill slot on success; D-13503 empty-deck branch; G.messages line
- `packages/game-engine/src/ui/uiState.build.ts` — graduate `decks.heroDeckCount`; remove safe-skip marker
- `packages/game-engine/src/index.ts` — export new helpers

**Modified (tests — 6):**
- `packages/game-engine/src/board/city.logic.test.ts`
- `packages/game-engine/src/setup/buildInitialGameState.test.ts`
- `packages/game-engine/src/setup/buildCardStats.test.ts`
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts`
- `packages/game-engine/src/moves/recruitHero.impl.test.ts`
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — safe-skip count 8 → 7; new field pinned

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
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; baseline grows by [12, 25] tests.
- [ ] `Select-String -Path "packages\game-engine\src\setup\buildHeroDeck.ts" -Pattern "Math\.random"` returns no output.
- [ ] `Select-String -Path "packages\game-engine\src\setup\buildHeroDeck.ts","packages\game-engine\src\board\city.logic.ts" -Pattern "from ['""]boardgame\.io" -Recurse` returns no output.
- [ ] `Select-String -Path "packages\game-engine\src\ui\uiState.build.ts" -Pattern "SAFE-SKIP-WP128"` shows the marker count drop (was 8 assignment-site matches; now 7).
- [ ] D-13501..D-13503 cited at the locked sites (per §3).
- [ ] `git diff packages/game-engine/src/replay/replay.execute.test.ts` is empty (no cascade) OR a single-line `PRE_WP080_HASH` literal update with a `// why:` comment.
- [ ] `git diff --name-only apps/ packages/registry packages/preplan packages/vue-sfc-loader .claude/rules` returns no output.
- [ ] Manual smoke (recommended): start the smoke-test server, create a 2-player match, confirm 5 HQ slots are populated at match start; recruit one hero on the active player's turn; confirm the slot refills from the deck and `decks.heroDeckCount` decrements by 1.

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
- Engine baseline shows fewer tests than `[621+12, 621+25]` → some required test additions were skipped; check §4 modified test files.
- 01.5 cascade test fails on `replay.execute.test.ts:117` → expected per WP-128 D-12807; capture the post-edit hash and update the literal at exactly one site with the cited `// why:` comment.
- `recruitHero` test fails on the empty-deck branch → check D-13503 site; the slot must be set to `null`, not the prior recruited card or a stale value.
- Drift test fails on safe-skip count → forgot to decrement from 8 to 7 in the drift assertion.
- New `throw` statement in `recruitHero.impl.ts` → move-as-no-throw contract violated; refactor the empty-deck branch to return-void rather than throw.
