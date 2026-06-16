# EC-286 — "The Amazing Spider-Man" Reveal-Top-N (Execution Checklist)

**Source:** docs/ai/work-packets/WP-255-amazing-spider-man-reveal-top-n.md
**Layer:** Game Engine (`hero/heroEffects.execute.ts` + `setup/heroAbility.setup.ts`) + Card Data (`data/cards/core.json`).
**User-Visible Surface:** play.legendary-arena.com (⇒ live-verification REQUIRED in After Completing — D-24026).
**Decision:** D-24027 (reserved).

Authoritative execution contract for WP-255. Compliance is binary.

---

## Before Starting

- [ ] On `main`, clean, ff-synced. `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 (1359 baseline); `pnpm sim:coverage --check` OK.
- [ ] Read `heroEffectReveal` + its peek loop end-to-end; record the count=1 body verbatim (the byte-identity target). Read `REVEAL_RULE_PATTERN` + Step 2f + the effect-building reveal branch in `heroAbility.setup.ts`.
- [ ] Confirm `data/cards/core.json` `spider-man` / `the-amazing-spider-man` ability line is dark (no `[keyword:` marker) before marking.

---

## Locked Values

- **WP:** WP-255. **EC:** EC-286. **Decision:** D-24027 (reserved).
- **Peek-advance loop (locked):** the reveal loop reads `deck[peekOffset]` (`let peekOffset = 0`), NOT a hardcoded `deck[0]`. Stop when `peekOffset >= playerZones.deck.length`. Capture `deck.length` before `applyRevealRules`; after it, `peekOffset++` ONLY when the length is **unchanged** (the card stayed); leave `peekOffset` when the length **shrank** (draw/ko removed the peeked card — the next card slid into the same index). Re-read the live `deck` each iteration; do NOT snapshot.
- **count=1 byte-identity (locked, highest risk):** one iteration at `peekOffset = 0` is identical to the WP-253 `deck[0]` peek. The 8 per-keyword reveal tests AND the WP-253 count=2 deck-mutating loop test MUST pass UNCHANGED (the count=2 test draws → deck shrinks → offset stays 0 → same as before). Do not edit those tests.
- **`revealCount` marker (locked):** `REVEAL_COUNT_PATTERN = /\[keyword:reveal-count:(\d+)\]/g`. The captured `n` (≥ 1) sets `revealCount` on the `reveal` descriptor emitted from the SAME ability line; absent ⇒ `revealCount` stays its WP-253 default of `1`. Disambiguation (no new collisions — verify in execution): `[keyword:reveal-count:N]` is **not** matched by `REVEAL_RULE_PATTERN` (it needs literal `reveal:<pred>`); `KEYWORD_PATTERN` matches it as keyword `reveal-count` but `isValidHeroKeyword('reveal-count')` is **false** so it never becomes a keyword/effect — only `REVEAL_COUNT_PATTERN` consumes it. `reveal-count` is **NOT** added to `HERO_KEYWORDS` (it is a modifier marker, not a keyword) — the 17-entry `HERO_KEYWORDS` drift test stays untouched.
- **Card marker (locked):** append exactly `[keyword:reveal:cost-lte-2:draw][keyword:reveal-count:3]` to `the-amazing-spider-man`'s ability line ⇒ `{ type: 'reveal', revealCount: 3, revealRules: [{ predicate: { kind: 'cost-lte', threshold: 2 }, actions: [{ kind: 'draw' }] }] }`. No other card touched.
- **Commit message (execution):** `EC-286: amazing spider-man reveal-top-N — peek-advance loop + revealCount marker (D-24027)` (`EC-###:` prefix — code staged).

---

## Guardrails

- Count=1 reveal behavior is BYTE-IDENTICAL — if any of the 8 reveal-keyword tests or the WP-253 count=2 test changes its assertion OUTPUT, the peek-advance leaked into count=1; re-confine.
- No new `RevealPredicate` / `RevealAction` kinds; `revealRule.ts` contracts unchanged; the 5+5 drift arrays untouched.
- No `.reduce()` in the loop; explicit `for` with `peekOffset`. Unknown predicate/action still warns to `G.messages` + continues (WP-253 behavior).
- `data/cards/core.json` diff is EXACTLY the one ability line on `the-amazing-spider-man` — no reflow, no other card, no field reorder.
- `HERO_KEYWORDS` (17) unchanged; `reveal-count` is a marker, not a keyword.
- `G` stays JSON-serializable; `revealCount` is a number on the descriptor (already in the type from WP-253).

---

## Required `// why:` Comments

- At the peek-offset advance: count=1 is byte-identical (one iteration at offset 0); the advance is the WP-253-deferred multi-peek (D-24024 → D-24027); a deck-shrinking iteration keeps the offset because the array shifted.
- At `REVEAL_COUNT_PATTERN` + its application: the count is descriptor-level (cards to peek), not rule-level; dedicated token (mirrors `COUNT_SCALED_PATTERN`); `reveal-count` is a modifier, never a HeroKeyword.

---

## Files to Produce

- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — `deck[peekOffset]` peek-advance loop
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — reveal-top-N (mixed-cost, advance-past-non-drawn, short-deck) + the count=1 byte-identity tests left untouched
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — `REVEAL_COUNT_PATTERN` → `revealCount` on the reveal descriptor
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — `reveal-count` marker parse + the Spider-Man-shaped line → `revealCount: 3`
- `data/cards/core.json` — **modified** — mark `the-amazing-spider-man` (one ability line)
- Governance: `STATUS.md`, `DECISIONS.md` (D-24027), `WORK_INDEX.md` (WP-255 ✅), `EC_INDEX.md` (EC-286 Done), `05-ROADMAP-MINDMAP.md`.

---

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` — all pass / 0 fail; reveal-top-3 draws cost ≤ 2 and leaves the rest in order; short-deck stops cleanly; the 8 reveal-keyword tests + WP-253 count=2 test UNCHANGED.
- [ ] `pnpm sim:coverage --check` OK — `the-amazing-spider-man`'s hook becomes EXECUTABLE (coverage IMPROVES; `noEffect` does not rise).
- [ ] `[keyword:reveal-count:3]` parses to `revealCount: 3`; the marked line → the locked descriptor; `HERO_KEYWORDS` still 17.
- [ ] `git diff --name-only -- data/cards/` → `data/cards/core.json` only (one line).
- [ ] `git diff --name-only` → only the 5 Files to Produce + governance.
- [ ] **LIVE (D-24026 — REQUIRED, surface = play.legendary-arena.com):** after deploy (Render engine rebuild + R2 card-data publish), play "The Amazing Spider-Man" in a real/autoplay match on play.legendary-arena.com; observe 3 cards revealed + the ≤2-cost ones drawn; capture evidence (screenshot / observed behavior / deploy-confirmed SHA serving the marked `core.json`). Green tests + merge do NOT satisfy this item.

---

## Common Failure Smells

- A reveal-keyword test or the WP-253 count=2 test changed its OUTPUT → the peek-advance leaked into count=1; the offset must only advance on a non-mutating iteration at count>1.
- Reveal-top-3 re-peeks the same card / loops on an expensive top card → the offset did not advance on the non-drawn iteration.
- `the-amazing-spider-man` still dark after marking → the `revealCount` marker or the parameterized `[keyword:reveal:cost-lte-2:draw]` didn't emit the descriptor; check `REVEAL_COUNT_PATTERN` application + Step 2f.
- `HERO_KEYWORDS` drift test fails → `reveal-count` was wrongly added to the keyword union; it is a marker, not a keyword.
- `data/cards/**` diff shows more than one line → re-marking/reflow crept in; revert to the single ability-line edit.
- DoD checked off on green tests + merge with no live observation → violates D-24026; the surface is `play.legendary-arena.com`.
