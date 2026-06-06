# EC-250 — Hero Reveal Compound Executor + VP-Cost Corpus Extension (Execution Checklist)

**Source:** docs/ai/work-packets/WP-218-hero-reveal-compound-and-vp-cost-corpus.md
**Layer:** Game Engine + Offline Tooling + Card Data

## Before Starting

- [ ] WP-217 merged to origin/main — commit `159d606` present in `git log`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — baseline **1125** passing
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `git diff --name-only data/cards/ packages/game-engine/` — empty (clean baseline)
- [ ] `HERO_KEYWORDS` has exactly 10 entries before this session starts

## Locked Values (do not re-derive)

- New keyword string: `'reveal-ko-or-draw'` (hyphen-separated, no spaces)
- KO removal path: `moveCardFromZone(playerZones.deck, [], topCardId)` → assign `playerZones.deck = moveResult.from` → `if (moveResult.found) G.ko = koCard(G.ko, topCardId)`
- **`koCard` MUST NOT be called unless `moveResult.found === true`** — invariant, not advisory
- Draw path: `moveCardFromZone(playerZones.deck, playerZones.hand, topCardId)` → assign `playerZones.deck = moveResult.from; playerZones.hand = moveResult.to`
- Branch order: `if (cardStats.cost === 0)` → `else if (cardStats.cost <= effect.magnitude)` — KO structurally precedes draw
- Magnitude gate: `!isValidMagnitude(effect.magnitude) || effect.magnitude < 1` → skip (undefined AND ≤ 0 both invalid)
- VP-cost detection regex: `/costs\s+0(?:\[icon:vp\])?,\s*KO it/i`
- Range-draw regex: `/costs\s+(\d+)\s+or\s+(\d+),\s*draw it/i`
- `suggestRevealKoOrDrawToken` returns `null` on regex failure; caller must guard before emitting row
- HERO_KEYWORDS count after: **11** (drift-detection test must assert exactly 11)
- Token form: `[keyword:reveal-ko-or-draw:N]` where N = `Math.max(match[1], match[2])` from range-draw regex

## Guardrails

- `koCard` only after `moveResult.found === true` — no phantom KOs under any code path
- `if (cost === 0)` guard structurally precedes `else if` draw branch — zero-cost card is never drawn
- `isRevealKoOrDrawCandidate`: requires positive match on both zero-cost-KO phrase AND range-draw regex; this makes it structurally mutually exclusive with `isRevealKoCandidate` (which excludes `'draw it.'`) — ordering in `collectProposeRowsForSet` is defense-in-depth, not primary exclusivity
- `suggestRevealKoOrDrawToken(line)` returns `null` on regex failure — `collectProposeRowsForSet` must skip null suggestions (no row emitted)
- `HERO_KEYWORDS` array and `HeroKeyword` union must be updated atomically — never one without the other
- No `.reduce()` in zone operations; no direct G mutation outside the Immer draft context
- No files outside §Files Expected to Change — 12 files maximum; `git diff --name-only` must match exactly

## Required `// why:` Comments

- `heroKeywords.ts`, `'reveal-ko-or-draw'` array entry: cite D-21802
- `heroEffects.execute.ts`, `reveal-ko-or-draw` case opening: "reveal-ko-or-draw peeks deck top; KOs the card (removing it from deck) when cost = 0; draws it when 0 < cost <= magnitude; no-op otherwise (D-21802)"
- `heroEffects.execute.ts`, `reveal-ko` case (existing): preserve or update to cite D-21801 for the deck-removal fix

## Files to Produce

- `packages/game-engine/src/rules/heroKeywords.ts` — **modified** — add `'reveal-ko-or-draw'` to union + array
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — fix `reveal-ko` deck removal (D-21801); add `reveal-ko-or-draw` to MVP_KEYWORDS + executor case (D-21802)
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — correct test 20 deck assertion; add ≥7 new cases for `reveal-ko-or-draw`
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — 10 → 11 in drift-detection test
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified** — extend VALID_TOKEN_PATTERN; replace `isRevealKoCandidate` zero-cost check with VP-cost regex; add `isRevealKoOrDrawCandidate`, `suggestRevealKoOrDrawToken`; update candidate routing order
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — 2 new entries; 2 deferred block removals
- `data/cards/ssw2.json` — **modified** — silk/silk-stalking abilityIndex=0 markup
- `data/cards/dkcy.json` — **modified** — punisher/boom-goes-the-dynamite abilityIndex=0 markup
- `docs/ai/DECISIONS.md` — **modified** — D-21801..D-21803 Active
- `docs/ai/STATUS.md` — **modified** — WP-218 executed
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-218 `[ ]` → `[x]` with date + stats
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-250 Draft → Done

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0, count ≥ **1133**
- [ ] `pnpm -r build` exits 0
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs` reports `Updated: 2` on first run
- [ ] Second apply run: `git diff data/cards/` empty
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `grep "\[keyword:reveal-ko-or-draw:" data/cards/ssw2.json | wc -l` = 1
- [ ] `grep "\[keyword:reveal-ko\]" data/cards/dkcy.json | wc -l` = 1
- [ ] D-21801..D-21803 Active in `docs/ai/DECISIONS.md`
- [ ] `docs/ai/STATUS.md` updated — WP-218 executed
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-218 checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-250 Done

## Common Failure Smells

- Test count < 1133 → test 20 correction didn't add the deck-shrink invariant assertions, or the magnitude=0 no-op test was omitted
- Cost-0 card still in `deck` after `reveal-ko` fires → `moveCardFromZone` deck removal was skipped (D-21801 bug re-introduced)
- `--propose` shows > 2 new rows → detection overlap: `isRevealKoOrDrawCandidate` not evaluated before `isRevealKoCandidate`, or the mutual-exclusivity guard (`draw it.` exclusion in plain-KO candidate) was removed
- Cost-0 card drawn → KO branch not in `if`; draw branch in `else if` was changed to standalone `if`
- `suggestRevealKoOrDrawToken` returns `[keyword:reveal-ko-or-draw:undefined]` → `Math.max(Number(match[1]), Number(match[2]))` not called; raw match capture used instead
