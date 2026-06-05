# EC-247 — Hero Rescue and Reveal-Draw Effects (Execution Checklist)

**Source:** docs/ai/work-packets/WP-215-hero-rescue-and-reveal-draw-effects.md
**Layer:** Game Engine + Card Data

## Before Starting
- [ ] WP-022 is done: `heroEffects.execute.ts` exists with `MVP_KEYWORDS` and `executeSingleEffect`
- [ ] WP-023 is done: `heroConditions.evaluate.ts` exists
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (clean baseline)
- [ ] `pnpm -r build` exits 0
- [ ] Read `heroEffects.execute.ts` in full before editing
- [ ] Read `heroAbility.setup.ts` `parseAbilityText()` before editing

## Locked Values (do not re-derive)
- `MVP_KEYWORDS` must include `'rescue'` and `'reveal'` after this WP
- Ability line 1 (Web-Shooters): `"Rescue a Bystander. [keyword:rescue:1]"` — verbatim
- Ability line 2 (Web-Shooters): `"Reveal the top card of your deck. If that card costs 2[icon:vp] or less, draw it. [keyword:reveal]"` — verbatim (no `:2` suffix; threshold extracted from `2[icon:vp]` by VP-cost pattern)
- Icon-magnitude pattern (attack/recruit): `/\+?(\d+)\s*\[icon:(attack|recruit)\]/g` — exact form
- VP-cost-threshold pattern (reveal): `/(\d+)\s*\[icon:vp\]\s*or less/` — non-global; first match only
- Icon-magnitude populates same `magnitudes` map as `[keyword:X:N]`; explicit markup takes precedence for same keyword
- `rescue` magnitude default: `effect.magnitude ?? 1`
- `rescue` destination zone: `G.playerZones[playerID].victory` (not hand, not discard)
- Top-of-pile convention: `G.piles.bystanders[0]` is the top card
- `reveal` no-op conditions: `deck.length === 0` OR `G.cardStats[topCardId] === undefined`
- `reveal` draw condition: `cardStats.cost <= effect.magnitude`; if false, deck unchanged
- Extended pattern captures optional `:N` suffix; `[keyword:X]` without suffix still valid (magnitude undefined)
- Only `data/cards/core.json` Web-Shooters entry is touched — no other card JSON files

## Guardrails
- No `.reduce()` in the new `rescue` loop — use `for` loop with explicit break
- Assign new arrays to `G.piles.bystanders` and `playerZones.victory` (Immer draft pattern); never in-place push/splice
- `executeSingleEffect` must not throw — all edge cases (empty pile, missing stats, invalid magnitude) return/break silently
- `wound` and `conditional` remain in the NOT-executed path — do not implement them
- Do not touch any `heroConditions.evaluate.ts` files
- `KEYWORD_PATTERN` const is replaced (not a second separate const added)
- VP threshold extraction must require `or less` in the pattern — do not extract bare `N[icon:vp]` (victory-point values use same icon)

## Required `// why:` Comments
- `rescue` case: `// why: top-of-pile convention — pile[0] is the first available bystander (D-21501)`
- `reveal` empty-deck branch: `// why: reveal does not trigger deck reshuffle; empty deck is a silent no-op (D-21502)`
- `reveal` missing-stats branch: `// why: G.cardStats has no entry for SHIELD starter cards; missing entry is a safe no-op (D-21502)`
- Extended `KEYWORD_PATTERN` declaration: `// why: optional :N suffix carries magnitude for rescue/reveal effects (D-21503)`
- Icon-magnitude pattern declarations: `// why: extract magnitude from icon-adjacent integers — avoids per-card manual markup (D-21505)`

## Files to Produce
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — extend `KEYWORD_PATTERN` + magnitude extraction (`[keyword:X:N]` and icon-adjacent patterns)
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — add `rescue`/`reveal` to `MVP_KEYWORDS` + implement both cases
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — update rescue-as-unsupported test; add ≥ 8 new tests
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — add ≥ 3 magnitude extraction tests
- `data/cards/core.json` — **modified** — markup on Web-Shooters ability lines only

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `pnpm -r build` exits 0
- [ ] `grep "keyword:rescue:1" data/cards/core.json` returns one match
- [ ] `grep "keyword:reveal\]" data/cards/core.json` returns one match (no `:2` suffix)
- [ ] `wound` and `conditional` are NOT in `MVP_KEYWORDS`
- [ ] `docs/ai/DECISIONS.md` D-21501..D-21505 added
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` flipped to `[x]` with date

## Common Failure Smells
- `rescue` moves card to `hand` instead of `victory` — check zone destination
- `reveal` reshuffles deck before peeking — the no-reshuffle guard must be the first branch
- `[keyword:X]` markup without `:N` suffix breaks existing hook tests — confirm backwards-compat in heroAbility.setup.test.ts
- `KEYWORD_PATTERN` being added as a second const instead of replacing the original — check for duplicate const declaration
- Icon-magnitude extraction grabbing bare `N[icon:vp]` (victory-point values) — pattern MUST require `or less` to follow; check the regex has `\s*or less`
- Attack/recruit magnitude not landing on the effect descriptor — verify `magnitude: 2` appears in tests for a `+2[icon:attack]` ability line
