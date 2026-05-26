# EC-203 — Card Traits & Superpower Evaluation (Execution Checklist)

**Source:** docs/ai/work-packets/WP-179-card-traits-and-superpower-evaluation.md
**Layer:** Game Engine

## Before Starting
- [ ] WP-021, WP-022, WP-023, WP-111 complete on `origin/main`
- [ ] Read WP-179 in full (this EC is the execution contract; WP is the design authority)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] Confirm `heroClassMatch` case in `heroConditions.evaluate.ts` returns `false` (placeholder)
- [ ] Confirm `[team:X]` regex does NOT exist in `heroAbility.setup.ts` (not yet parsed)

## Locked Values (do not re-derive)
- `CardTraitEntry = { heroClass: string | null; team: string | null }`
- `G.cardTraits: Record<CardExtId, CardTraitEntry>` — keyed by copy-suffixed ext_ids (e.g., `core/black-widow/mission-accomplished#0`)
- `TEAM_PATTERN = /\[team:([^\]]+)\]/g`
- `normalizeTraitSlug(raw)` = `raw.trim().toLowerCase()` — defined in `state/traits.normalize.ts`, imported by both parser and builder
- `normalizeTraitSlug` applied to BOTH `[hc:X]` and `[team:X]` captured values (defense-in-depth)
- Condition type strings: `'heroClassMatch'` (existing), `'requiresTeam'` (new emission)
- Evaluator signature: `evaluateCondition(G, playerID, condition, triggeringCardId?)`
- `evaluateAllConditions(G, playerID, conditions, triggeringCardId?)`
- UICardDisplay additive fields: `heroClass?: string | null`, `team?: string | null` — optional in type, always assigned at runtime
- Trait projection fallback: `null` (never `undefined`) when lookup misses
- Condition emission order: all `heroClassMatch` first, then `requiresTeam` (deterministic, independent of markup position)
- Superpower prerequisite zone: `playerZones[playerID].inPlay` (canonical "played this turn")

## Guardrails
- `buildCardTraits` must enumerate the same `CardExtId` universe as `buildCardStats()` (single enumeration authority) and fan out per copy using `#N` suffix; omitting fan-out silently breaks all superpowers
- `heroClassMatch` and `requiresTeam` MUST skip `triggeringCardId` when scanning `inPlay` (self-exclusion rule); a card's own class/team does not satisfy its own superpower
- `triggeringCardId` is optional; when omitted, evaluator behavior is identical to WP-023 (backward compatible)
- `requiresKeyword` and `playedThisTurn` MUST NOT consult `triggeringCardId` (ignore it)
- `normalizeTraitSlug` lives in `state/traits.normalize.ts` — do NOT define a second normalizer in any other file
- No registry imports in game-engine files — structural interface `CardTraitsRegistryReader` only
- No `.reduce()` in builder or evaluator loops — use `for...of`
- `[team:X]` markup extraction must mirror `[hc:X]` pattern exactly: extract conditions, then the markup tokens are consumed (no stray brackets in downstream text)
- `uiState.build.ts` always assigns both `heroClass` and `team` keys on every `UICardDisplay` (runtime shape guarantee despite optional TS typing)

## Required `// why:` Comments
- `traits.normalize.ts`: why a shared module (single canonical normalization path; prevents competing normalizers)
- `cardTraits.types.ts`: why categorical traits are separated from economy stats (`CardStatEntry`)
- `buildCardTraits.ts`: why fan-out per copy is required (zone entries are copy-suffixed ext_ids)
- `heroAbility.setup.ts` (team parsing): why this mirrors the `[hc:X]` pattern
- `heroAbility.setup.ts` (hc normalization): why defense-in-depth normalization on already-validated values
- `heroConditions.evaluate.ts` (heroClassMatch): why self is excluded from scan
- `heroConditions.evaluate.ts` (requiresTeam): why self is excluded from scan
- `heroEffects.execute.ts`: why `cardId` is threaded through to condition evaluation
- `uiState.build.ts` (trait projection): why `null` on lookup miss and why both keys always assigned

## Files to Produce
- `packages/game-engine/src/state/traits.normalize.ts` — **new** — `normalizeTraitSlug()` shared helper
- `packages/game-engine/src/state/cardTraits.types.ts` — **new** — `CardTraitEntry` interface
- `packages/game-engine/src/setup/buildCardTraits.ts` — **new** — setup-time builder + `CardTraitsRegistryReader`
- `packages/game-engine/src/setup/buildCardTraits.test.ts` — **new** — builder unit tests (including ID invariant)
- `packages/game-engine/src/types.ts` — **modified** — add `cardTraits` field to `LegendaryGameState`
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — call `buildCardTraits()`, assign to `G.cardTraits`
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — add `TEAM_PATTERN`, normalize `[hc:X]` values, import shared helper
- `packages/game-engine/src/setup/heroAbility.setup.test.ts` — **modified** — team markup, mixed markup order, mixed-case parsing tests
- `packages/game-engine/src/hero/heroConditions.evaluate.ts` — **modified** — wire both evaluators, add `triggeringCardId` param
- `packages/game-engine/src/hero/heroConditions.evaluate.test.ts` — **modified** — positive, self-only, mismatch, undefined-trait tests
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — thread `cardId` to `evaluateAllConditions`
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — update call sites
- `packages/game-engine/src/hero/heroEffects.conditional.test.ts` — **modified** (if exists) — update call sites
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — add optional `heroClass`, `team` to `UICardDisplay`
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** (01.5 wiring cascade) — update UICardDisplay field count 4→6, keyset assertion
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — always assign trait fields on every display entry

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `pnpm -r build` exits 0
- [ ] Grep gate: zero unpatched callers of `evaluateCondition` or `evaluateAllConditions` outside inventoried sites
- [ ] Grep gate: `normalizeTraitSlug` defined in exactly 1 file (`state/traits.normalize.ts`)
- [ ] ID invariant test exists: every `id` in a populated `inPlay` resolves to a defined `CardTraitEntry`
- [ ] Integration test confirms Tech -> Tech superpower draw fires (condition true AND side effect occurred)
- [ ] Integration test confirms Avengers -> Avengers team condition passes (condition true AND side effect occurred)
- [ ] `docs/ai/DECISIONS.md` updated (D-17901, D-17902, D-17903, D-17904)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date

## Common Failure Smells
- Superpowers never fire despite correct card data -> builder omitted `#N` copy-suffix fan-out (ID invariant test catches this)
- `heroClassMatch` returns `true` when only one card of that class is in play -> self-exclusion not wired (`triggeringCardId` not passed)
- `[team:avengers]` markup produces no conditions -> `TEAM_PATTERN` regex missing or not applied in `parseAbilityText`
- `[hc:Tech]` silently fails to match `tech` in `cardTraits` -> `normalizeTraitSlug` not applied to `[hc:X]` values
- `UICardDisplay.heroClass` is `undefined` instead of `null` -> `uiState.build.ts` not assigning both keys on every entry
- Test count inflated by grep gate echo -> a `// why:` comment names the policed literal; paraphrase instead
