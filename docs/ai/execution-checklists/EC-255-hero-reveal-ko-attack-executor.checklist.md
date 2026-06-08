# EC-255 — Hero Reveal KO-Attack Executor (Execution Checklist)

**Source:** docs/ai/work-packets/WP-223-hero-reveal-ko-attack-executor.md
**Layer:** Game Engine + Offline Tooling + Card Data
**Status:** Draft — pre-flight READY + copilot PASS recorded in WP-223 (2026-06-07); ready for execution

## Before Starting

- [ ] WP-222 merged to origin/main (`HERO_KEYWORDS` = 14, engine tests = 1170)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — baseline **1170** passing
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `git diff --name-only data/cards/ packages/game-engine/` — empty (clean baseline)
- [ ] `HERO_KEYWORDS` has exactly **14** entries before this session starts
- [ ] `'reveal-ko-attack'` does NOT appear in `heroKeywords.ts` or `heroEffects.execute.ts`

## Locked Values (do not re-derive)

- New keyword string: `'reveal-ko-attack'` (exact form)
- Token form: `[keyword:reveal-ko-attack:N]` — magnitude required; `[keyword:reveal-ko-attack]` (bare) and `[keyword:reveal-ko-attack:0]` are both invalid
- Magnitude semantics: fixed attack grant amount — NOT a cost ceiling, NOT the revealed card's cost
- Trigger condition: `deck[0].cost === 0` (strict equality — not `<=`, not `< 1`)
- Effect when condition met: (1) `moveCardFromZone(playerZones.deck, playerZones.koPile, topCardId)` → if `found: false`, exit without attack grant; if `found: true`, (2) `G.turnEconomy.attack += effect.magnitude`
- Effect when condition NOT met: no zone mutation — card stays at `deck[0]`
- `G.pendingHeroChoice` — NOT touched (not read, not set, not cleared)
- In-scope card: `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner` → `[keyword:reveal-ko-attack:1]`
- `HERO_KEYWORDS` count after: **15**
- Engine test floor after: **≥ 1177**
- Detection reveal anchor: `/Reveal the top card of your deck\./i` — required before any KO-attack detection
- KO-attack detection pattern: `/If it costs 0,\s*KO it and you get \+(\d+)\[icon:attack\]/i` (`\s*` tolerates minor whitespace; capture group = magnitude)
- Routing: `isRevealKoAttackCandidate` routes AFTER both `isRevealKoOrDrawCandidate` AND `isRevealKoCandidate` in `collectProposeRowsForSet`
- KO atomicity: attack granted IFF `moveCardFromZone` returns `found: true`; no partial mutation
- `topCardId` captured from `deck[0]` once, before any mutation; not re-read after `moveCardFromZone`
- `effect.magnitude` MUST be positive integer `>= 1`; treat invalid/missing/zero/non-integer as silent no-op — no coercion

## Guardrails

- `reveal-ko-attack` MUST NOT appear in `NO_MAGNITUDE_KEYWORDS` — magnitude is always required
- Executor is fully synchronous — `G.pendingHeroChoice` is NOT set, read, or cleared
- Executor is atomic: `G.turnEconomy.attack` MUST NOT be mutated unless `moveCardFromZone` returns
  `found: true`; attack is NOT granted when KO fails — no partial state mutation permitted
- All precondition guards (`playerZones` missing, deck empty, `cardStats` missing, `G.turnEconomy`
  undefined, magnitude invalid) MUST fire BEFORE any zone mutation
- Trigger condition is `cost === 0` (strict equality only) — not `cost <= magnitude`, not `cost <= 0`
- Magnitude encodes the fixed attack grant amount; it does NOT act as a cost ceiling
- KO fires BEFORE attack grant — `moveCardFromZone` call precedes the `+= magnitude` mutation
- Silent no-op conditions (no throw, no log): empty deck, `playerZones` missing, `cardStats[topCardId]` missing, `G.turnEconomy` undefined, invalid or absent magnitude
- `assertValidToken` MUST reject bare form `[keyword:reveal-ko-attack]` and zero-magnitude form `[keyword:reveal-ko-attack:0]`
- `isRevealKoAttackCandidate` MUST require both the reveal anchor AND the compound-effect phrase — anchor alone is insufficient
- `isRevealKoAttackCandidate` MUST route AFTER both `isRevealKoOrDrawCandidate` AND `isRevealKoCandidate` — both have first-match priority on cost=0 cards
- No `.reduce()` in zone operations; zone mutations via `zoneOps.ts` helpers only

## Required `// why:` Comments

- `heroKeywords.ts`, `'reveal-ko-attack'` entry: cite D-22301 — locks the fixed-attack-grant model (magnitude ≠ cost ceiling)
- `heroEffects.execute.ts`, `reveal-ko-attack` case opening: cite D-22301 — explain two-effect ordering (KO then grant) and cost===0 trigger
- `heroEffects.execute.ts`, `moveCardFromZone` return check: explain atomicity — attack is not granted when KO did not occur (no partial mutation)
- `heroEffects.execute.ts`, `G.turnEconomy` undefined guard: explain why silent no-op is correct (executor runs mid-turn; `turnEconomy` initialised by turn-start machinery, not the executor)
- `apply-hero-ability-markers.mjs`, `isRevealKoAttackCandidate` routing: explain why it follows `isRevealKoOrDrawCandidate` (more specific pattern wins on cost=0 cards)

## Files to Produce

- `packages/game-engine/src/rules/heroKeywords.ts` — **modified** — add `'reveal-ko-attack'` to union + array
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — `reveal-ko-attack` executor case
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — ≥ 7 executor cases
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — drift pin 14 → 15
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified** — `isRevealKoAttackCandidate` + `suggestRevealKoAttackToken` + routing
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — 1 new detection entry
- `data/cards/ssw2.json` — **modified** — `youre-a-slow-learner` markup (`[keyword:reveal-ko-attack:1]`)
- `docs/ai/DECISIONS.md` — **modified** — D-22301 Active with Landed date
- `docs/ai/STATUS.md` — **modified**
- `docs/ai/work-packets/WORK_INDEX.md` — **modified**
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified**

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0, count ≥ **1177**
- [ ] `pnpm -r build` exits 0
- [ ] `HERO_KEYWORDS` count = **15** (drift-detection test passes)
- [ ] `G.pendingHeroChoice` not referenced anywhere in the new executor code
- [ ] KO fires and attack granted when `deck[0].cost === 0`; no mutation when cost > 0
- [ ] KO-fail path: `moveCardFromZone` returning `found: false` does NOT grant attack (no partial mutation)
- [ ] Invalid magnitude (0, undefined, negative) → no zone mutation, no attack change
- [ ] `G.turnEconomy` undefined → executor exits silently; no crash
- [ ] `grep "\[keyword:reveal-ko-attack:1\]" data/cards/ssw2.json | wc -l` = 1
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `assertValidToken` rejects bare form and `:0` form
- [ ] D-22301 Active in DECISIONS.md with Landed date
- [ ] WORK_INDEX.md WP-223 → `[x]` Done with date + test count
- [ ] EC_INDEX.md EC-255 → Done
- [ ] No files outside §Files Expected to Change modified

## Common Failure Smells

- Test count < 1177 → missing KO-fail test, invalid-magnitude test, or test file not wired to runner
- `reveal-ko-attack` found in `NO_MAGNITUDE_KEYWORDS` → remove it; this keyword always requires a magnitude
- Attack granted when cost > 0 → trigger condition wrong; must be `cost === 0` (strict equality), not `cost <= magnitude`
- No KO when cost = 0 → effects swapped or branch inverted; KO (`moveCardFromZone`) fires first, then grant
- Attack granted even when `moveCardFromZone` returns `found: false` → missing return-value check; add `if (!result.found) { break }` before the `+= magnitude` line (atomicity violation)
- `deck[0]` re-read after zone mutation → capture `topCardId` before calling `moveCardFromZone`; zone array shifts after card removal
- `G.turnEconomy` undefined crash → guard missing; executor must silent no-op before the `+= magnitude` line
- `G.pendingHeroChoice` set by this executor → accidental copy from `reveal-attack-choose` case; this executor does not touch it
- `isRevealKoAttackCandidate` matches ko-or-draw candidates → routing order wrong; must follow both `isRevealKoOrDrawCandidate` and `isRevealKoCandidate`
- `--propose` finds 0 rows for ssw2 → reveal anchor regex doesn't match actual card text; inspect raw text and fix anchor before editing curated map
