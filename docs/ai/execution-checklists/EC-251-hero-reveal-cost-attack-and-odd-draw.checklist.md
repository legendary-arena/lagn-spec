# EC-251 — Hero Reveal Cost-Attack + Odd-Draw Executors (Execution Checklist)

**Source:** docs/ai/work-packets/WP-219-hero-reveal-cost-attack-and-odd-draw.md
**Layer:** Game Engine + Offline Tooling + Card Data

## Before Starting

- [ ] WP-218 merged to origin/main — commit `9c9215b` present in `git log`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — baseline **1133** passing
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `git diff --name-only data/cards/ packages/game-engine/` — empty (clean baseline)
- [ ] `HERO_KEYWORDS` has exactly 11 entries before this session starts

## Locked Values (do not re-derive)

- New keyword 1 string: `'reveal-cost-attack'` (hyphen-separated, no spaces)
- New keyword 2 string: `'reveal-odd-draw'` (hyphen-separated, no spaces)
- Cost-attack mutation: `G.turnEconomy.attack += cardStats.cost` — no zone mutation; card stays at `deck[0]`
- `G.turnEconomy` guard: `if (!G.turnEconomy) { break; }` — required before mutation
- Odd-draw condition: `cardStats.cost % 2 !== 0` — 0 is even, cost-0 does NOT draw
- Odd-draw path: `moveCardFromZone(playerZones.deck, playerZones.hand, topCardId)` → assign `playerZones.deck = moveResult.from; playerZones.hand = moveResult.to` when `moveResult.found === true`
- Both keywords have **no magnitude** — no suffix in token form: `[keyword:reveal-cost-attack]`, `[keyword:reveal-odd-draw]`
- Both keywords excluded from pre-check magnitude gate (like `rescue`, `reveal-ko`)
- HERO_KEYWORDS count after: **13** (drift-detection test must assert exactly 13)
- Token forms: `[keyword:reveal-cost-attack]` (no `:N` suffix), `[keyword:reveal-odd-draw]` (no `:N` suffix)

## Guardrails

- `reveal-cost-attack` MUST NOT mutate any zone — only `G.turnEconomy.attack` changes
- `G.turnEconomy` guard must precede the mutation — undefined G.turnEconomy exits silently
- `cost % 2 !== 0` is the canonical odd check — never `cost % 2 === 1` (fails for negative; canonical math form preferred)
- `reveal-odd-draw` draw path uses `moveResult.found` guard — same pattern as `reveal-min` and `reveal-ko-or-draw`
- `HERO_KEYWORDS` array and `HeroKeyword` union must be updated atomically — never one without the other
- No `.reduce()` in zone operations; no direct G mutation outside the Immer draft context
- No files outside §Files Expected to Change — 12 files maximum; `git diff --name-only` must match exactly
- `assertValidToken` must reject `[keyword:reveal-cost-attack:2]` (spurious suffix) — these tokens have no magnitude

## Required `// why:` Comments

- `heroKeywords.ts`, `'reveal-cost-attack'` array entry: cite D-21901
- `heroKeywords.ts`, `'reveal-odd-draw'` array entry: cite D-21902
- `heroEffects.execute.ts`, `reveal-cost-attack` case opening: "reveal-cost-attack peeks deck top; grants attack equal to its cost; card stays on deck (no zone mutation) (D-21901)"
- `heroEffects.execute.ts`, `reveal-odd-draw` case opening: "reveal-odd-draw peeks deck top; draws it when cost is odd (cost % 2 !== 0); cost-0 is even and does NOT trigger the draw (D-21902)"

## Files to Produce

- `packages/game-engine/src/rules/heroKeywords.ts` — **modified** — add `'reveal-cost-attack'` and `'reveal-odd-draw'` to union + array
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — add both to MVP_KEYWORDS + magnitude-gate exclusion + two executor cases (D-21901, D-21902)
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — add ≥11 new cases (5 for cost-attack, 6 for odd-draw)
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — 11 → 13 in drift-detection test
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified** — extend VALID_TOKEN_PATTERN; add `isRevealCostAttackCandidate`, `isRevealOddDrawCandidate`; update candidate routing
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — 2 new entries
- `data/cards/core.json` — **modified** — gambit/high-stakes-jackpot abilityIndex=0 markup
- `data/cards/msis.json` — **modified** — wanda-vision/witchcraft abilityIndex=0 markup
- `docs/ai/DECISIONS.md` — **modified** — D-21901..D-21903 Active
- `docs/ai/STATUS.md` — **modified** — WP-219 executed
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-219 `[ ]` → `[x]` with date + stats
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-251 Draft → Done

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0, count ≥ **1144**
- [ ] `pnpm -r build` exits 0
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs` reports `Updated: 2` on first run
- [ ] Second apply run: `git diff data/cards/` empty
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `grep "\[keyword:reveal-cost-attack\]" data/cards/core.json | wc -l` = 1
- [ ] `grep "\[keyword:reveal-odd-draw\]" data/cards/msis.json | wc -l` = 1
- [ ] D-21901..D-21903 Active in `docs/ai/DECISIONS.md`
- [ ] `docs/ai/STATUS.md` updated — WP-219 executed
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-219 checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-251 Done

## Common Failure Smells

- Test count < 1144 → magnitude-gate exclusion test missing, or cost-0 attack-grant case omitted (that's a valid 0-grant, not a no-op)
- `reveal-cost-attack` deck shrinks → zone mutation was accidentally added; executor must NOT call `moveCardFromZone`
- `reveal-odd-draw` draws cost-0 card → odd check is wrong; `0 % 2 === 0` so cost-0 must not draw
- `VALID_TOKEN_PATTERN` accepts `[keyword:reveal-cost-attack:2]` → no-suffix forms must not have a `:\d+` branch
- `--propose` shows 0 rows → candidate function regex doesn't match actual card text; run `--propose` first and read the output before editing the curated map
- `G.turnEconomy.attack` unchanged after cost-3 reveal → `G.turnEconomy` guard fires on a non-undefined object; check guard condition
