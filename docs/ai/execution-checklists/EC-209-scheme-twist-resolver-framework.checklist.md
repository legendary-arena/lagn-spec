# EC-209 — Scheme Twist Resolver Framework (Execution Checklist)

**Source:** docs/ai/work-packets/WP-182-scheme-twist-resolver-framework.md
**Layer:** Game Engine

## Before Starting
- [ ] WP-009B (rule execution pipeline) complete
- [ ] WP-153 (destination piles — `scheme.twistPile`) complete
- [ ] WP-179 (cardTraits) complete
- [ ] `schemeHandlers.ts` exists with current `if/else` dispatcher
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)
- `MVP_SCHEME_TWIST_THRESHOLD = 7`
- `BANK_CITY_INDEX = 1`
- `MIDTOWN_BYSTANDERS_PER_TWIST = 2`
- `SchemeTwistResolverId`: `'reveal-or-punish' | 'chained-reveals' | 'wound-all' | 'ko-from-hq' | 'midtown-bank-robbery'`
- Resolver signature: `(gameState, context, implementationMap, params) => void`
- Config shape: `{ schemeId, resolverId, params, lossThreshold? }`
- Resolvers mutate G directly — they do NOT return `RuleEffect[]`
- Generic effects (counter + loss-check) appended by dispatcher AFTER resolver

## Guardrails
- No `boardgame.io` imports in new files
- No `@legendary-arena/registry` imports in any engine file
- No `.reduce()` in zone operations or effect application — use `for...of`
- No `Math.random()` — determinism through `ctx.random.*` only
- All zone mutations through helpers (`gainWound`, `koCard`, `refillHqSlot`, `moveAllCards`)
- No new `RuleEffect` types — resolvers are pre-effect
- `buildGenericTwistEffects` logic unchanged (counter + loss-check); only change is accepting threshold param
- Resolvers never throw on invalid config — push message and return; generic effects still apply
- `ko-from-hq` tie-break: cost ascending, then HQ slot index left-to-right (deterministic)
- Do NOT modify read-only files listed in WP §Non-Negotiable Constraints

## Required `// why:` Comments
- `MVP_SCHEME_TWIST_THRESHOLD`: why 7 is the default
- `BANK_CITY_INDEX`: why city index 1 is the Bank
- `MIDTOWN_BYSTANDERS_PER_TWIST`: why 2 per twist
- `lossThreshold` override branch: why config overrides the default
- Config-not-found fallback: why counter-only is safe for unconfigured schemes
- `ko-from-hq` cost sort: why cheapest-first when `costThreshold` absent

## Files to Produce
- `src/rules/schemeTwistConfig.types.ts` — **new** — types + resolver ID union
- `src/rules/schemeTwistResolvers.ts` — **new** — 5 resolvers + registry map
- `src/rules/schemeTwistConfigs.ts` — **new** — core-set config entries
- `src/rules/schemeHandlers.ts` — **modified** — config-driven dispatcher
- `src/rules/schemeTwistResolvers.test.ts` — **new** — resolver unit tests
- `src/rules/schemeTwistConfigs.test.ts` — **new** — drift tests (resolverId + key/schemeId)

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (819+ tests)
- [ ] `pnpm -r build` exits 0
- [ ] `grep -c "schemeId ===" packages/game-engine/src/rules/schemeHandlers.ts` returns 0
- [ ] `docs/ai/DECISIONS.md` updated with D-18201
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-209 status updated

## Common Failure Smells
- Resolver returning `RuleEffect[]` instead of mutating G directly — resolver contract is `void`
- Resolver throwing on bad params — must push message and return instead
- `buildGenericTwistEffects` not called after resolver — dispatcher must always append generic effects
- `buildGenericTwistEffects` still hardcodes threshold — must accept it as parameter from dispatcher
- Config key mismatch — config map keys must be scheme ext_ids (e.g. `'core/midtown-bank-robbery'`), not resolver IDs; drift test B catches this
- `ko-from-hq` non-deterministic selection — must sort by cost then slot index, not arbitrary order
