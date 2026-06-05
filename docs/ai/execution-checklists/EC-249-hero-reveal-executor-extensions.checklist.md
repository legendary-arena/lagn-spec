# EC-249 — Hero Reveal Executor Extensions: Reveal-KO-If-Zero and Reveal-Draw-At-Least (Execution Checklist)

**Source:** docs/ai/work-packets/WP-217-hero-reveal-executor-extensions.md
**Layer:** Game Engine + Card Data + Offline Tooling

## Before Starting

- [ ] WP-216 done: `hero-ability-markers.json` + `apply-hero-ability-markers.mjs` committed; `--validate` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (clean baseline)
- [ ] `pnpm -r build` exits 0
- [ ] `git diff --name-only data/cards/ packages/game-engine/` is empty
- [ ] Read `heroKeywords.ts` — note current `HeroKeyword` union and `HERO_KEYWORDS` array before editing
- [ ] Read `heroAbility.setup.ts` — confirm current `KEYWORD_PATTERN` value: `/\[keyword:([a-zA-Z]+)(?::(\d+))?\]/g`
- [ ] Read `heroEffects.execute.ts` — locate `MVP_KEYWORDS`, `executeSingleEffect`, existing `'reveal'` case
- [ ] Read `heroEffects.execute.test.ts` — note test count for comparison after new cases added
- [ ] Run `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose` — confirm 0 rows for `reveal-ko` or `reveal-min` before script changes

## Locked Values (do not re-derive — see WP-217 §Contract)

- New HeroKeywords: `'reveal-ko'` (D-21701) and `'reveal-min'` (D-21702) — add to BOTH union AND array
- `KEYWORD_PATTERN` extended form: `/\[keyword:([a-zA-Z][a-zA-Z-]*)(?::(\d+))?\]/g` — hyphen allowed after first char
- Token forms (exact strings, no variation):
  - `[keyword:reveal-ko]` — no suffix ever; `reveal-ko` takes no magnitude
  - `[keyword:reveal-min:N]` — integer suffix required; N = minimum cost threshold
- `reveal-ko` executor: cost = 0 → KO; cost > 0 → no-op; empty deck → no-op; magnitude unused
- `reveal-min` executor: cost ≥ magnitude → draw; cost < magnitude → no-op; empty deck → no-op; undefined magnitude → skip
- Both executors: no deck reshuffle (D-21502 precedent); no throw on empty deck
- `assertValidToken` rejects `[keyword:reveal-ko:0]` (no suffix allowed) and `[keyword:reveal-min]` (suffix required)
- 5 in-scope cards: cvwr/cloak-dagger/darkness/0 (reveal-ko), cvwr/cloak-dagger/light/0 (reveal-min:1), cvwr/hercules/prince-of-power/0 (reveal-ko), wwhk/bruce-banner/dangerous-testing/0 (reveal-ko), wwhk/rick-jones/captain-marvel/0 (reveal-min:3)
- Run `--propose` BEFORE curating map entries — confirm slugs/indices match card data

## Guardrails

- HERO_KEYWORDS canonical array and HeroKeyword union must be updated together; drift-detection test must pass
- KO pile mutation: use same zoneOps helper as existing `'ko'` case — do NOT inline the mutation
- Deck-top access: use `G.heroDeck[playerID][0]` (or whatever the existing `'reveal'` case uses — verify and match)
- `reveal-ko` must NOT apply the magnitude pre-check gate (`effect.magnitude` check bypassed, same as `'ko'` and `'rescue'`)
- `reveal-min` MUST apply the magnitude pre-check gate (undefined magnitude → skip, same as `'draw'`)
- No `.reduce()` in executor branches
- `apply-effect-markers.mjs` and `villain-effect-markers.json` must remain byte-identical (do NOT touch)

## Required `// why:` Comments

- `reveal-ko` executor branch: `// why: reveal-ko peeks one card and KOs it only when cost = 0; deck empty is a silent no-op per D-21502 precedent`
- `reveal-min` executor branch: `// why: reveal-min draws the card only when cost >= threshold — opposite direction from 'reveal' which draws when cost <= threshold`
- `KEYWORD_PATTERN` regex change: `// why: hyphen allowed in keyword names to support reveal-ko and reveal-min tokens (D-21701, D-21702)`
- `assertValidToken` extension: `// why: only valid token forms per D-21601, D-21701, D-21702 — catch typos before data is written`

## Files to Produce

- `packages/game-engine/src/rules/heroKeywords.ts` — add `'reveal-ko'` and `'reveal-min'` to union + array
- `packages/game-engine/src/setup/heroAbility.setup.ts` — extend `KEYWORD_PATTERN`
- `packages/game-engine/src/hero/heroEffects.execute.ts` — add to `MVP_KEYWORDS`; add executor cases
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` (or new test file) — new test cases for all branches
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — extend `VALID_TOKEN_PATTERN`; add detection/suggestion functions; update `--propose` + `--validate`
- `scripts/convert-cards/inputs/hero-ability-markers.json` — 5 new entries + deferred block additions
- `data/cards/cvwr.json` — 3 ability lines marked
- `data/cards/wwhk.json` — 2 ability lines marked
- Governance (SPEC commit): `DECISIONS.md` D-21701..D-21704, `STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md`

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; count is higher than pre-change baseline (new test cases added)
- [ ] `pnpm -r build` exits 0
- [ ] Drift-detection test passes: `HERO_KEYWORDS` array matches `HeroKeyword` union (no new failure introduced)
- [ ] `node apply-hero-ability-markers.mjs --propose | grep "reveal-ko\|reveal-min"` shows exactly 5 rows
- [ ] `node apply-hero-ability-markers.mjs` reports `Updated: 5` on first run
- [ ] Second apply run: `git diff data/cards/` empty (idempotence)
- [ ] `node apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `grep "\[keyword:reveal-ko\]" data/cards/cvwr.json | wc -l` = 2
- [ ] `grep "\[keyword:reveal-ko\]" data/cards/wwhk.json | wc -l` = 1
- [ ] `grep "\[keyword:reveal-min:" data/cards/cvwr.json | wc -l` = 1
- [ ] `grep "\[keyword:reveal-min:" data/cards/wwhk.json | wc -l` = 1
- [ ] `grep -r "\[keyword:reveal-ko\]\|keyword:reveal-min" data/cards/ | grep -v "cvwr\|wwhk"` is empty (no leakage to other sets)
- [ ] `DECISIONS.md` D-21701..D-21704 Active; `STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md` updated
- [ ] No files outside WP-217 `## Files Expected to Change` were modified

## Common Failure Smells

- Drift-detection test fails after HeroKeyword change — means array and union are out of sync; update both in the same commit
- `[keyword:reveal-ko]` not parsed — `KEYWORD_PATTERN` regex not yet extended; hyphens still rejected
- `parseAbilityText` returns `magnitude: undefined` for `[keyword:reveal-min:3]` — check magnitude extraction path; `reveal-min` uses the standard `:N` suffix which the updated regex captures in group 2
- `reveal-ko` fires on a cost-1 card — magnitude pre-check gate was incorrectly applied (it strips cases with undefined magnitude; `reveal-ko` skips the gate, so a cost-1 card should still hit the executor but return no-op from the cost check)
- `assertValidToken` accepts `[keyword:reveal-ko:0]` — regex not tight enough; the `reveal-ko` branch must require end-of-string after the `]` with no suffix
- `Updated` count on first apply ≠ 5 — at least one map entry silently skipped; check heroSlug/cardSlug/abilityIndex against `--propose` output before closing
