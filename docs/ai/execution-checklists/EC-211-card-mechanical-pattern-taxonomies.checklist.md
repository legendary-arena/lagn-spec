# EC-211 — Card Mechanical Pattern Taxonomies (Execution Checklist)

**Source:** docs/ai/work-packets/WP-184-card-mechanical-pattern-taxonomies.md
**Layer:** Registry (`packages/registry/src/`) + Registry Viewer (`apps/registry-viewer/src/`)

## Before Starting
- [ ] Re-verify HEAD against draft baseline `0e2558f`; record current HEAD.
- [ ] WP-183 ✅ (EC-210): `schemeTwistClient.ts`, `SchemeTwistFilter.vue`, `FlatCard.twistPattern?` are landed.
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0 (baseline).
- [ ] `pnpm --filter registry-viewer build` exits 0 (baseline).
- [ ] `pnpm -r build` exits 0 (baseline).

## Locked Values (do not re-derive)
- Hero slug enum (10): `draw-engine`, `attack-boost`, `recruit-boost`, `class-synergy`, `team-synergy`, `deck-thin`, `reveal-manipulate`, `wound-interact`, `bystander-interact`, `keyword-carrier`
- Villain slug enum (8): `fight-draw`, `fight-wound-others`, `fight-ko-hero`, `fight-rescue`, `fight-gain-hero`, `fight-recruit`, `ambush-capture`, `ambush-cascade`
- Henchman slug enum (6): `hench-ko-hero`, `hench-recruit`, `hench-draw`, `hench-deck-filter`, `hench-gain-as-hero`, `hench-conditional`
- Mastermind slug enum (8): `strike-wound`, `strike-discard`, `strike-ko-hero`, `strike-capture`, `strike-spawn`, `strike-deck-disrupt`, `strike-escalate`, `strike-board`
- `flattenSet` extended param name: `patternAssignmentsByType?` (keys: `hero`, `villain`, `henchman`, `mastermind`, `scheme`)
- `applyQuery` new param name: `mechanicalPatterns?: Set<string>`
- `FlatCard` new field name: `mechanicalPattern?: string`
- Log prefix for all drift warnings: `[card-patterns]`
- Coverage minimums: heroes ≥ 302/318, villains ≥ 120/126, henchmen 46/46, masterminds ≥ 101/106
- Order values: heroes 10–100 (step 10), all other taxonomies 10–80 (step 10)

## Guardrails
- Each `*PatternAssignmentsSchema` MUST use its taxonomy-specific `z.enum` — not `z.string()`
- `flattenSet` MUST route by explicit `cardType` key; no dynamic dispatch; no singleton reads inside
- `applyQuery`: when `mechanicalPatterns` is active, silently ignore it if ≠ 1 active `cardType` — log `[card-patterns]` warning
- One taxonomy fetch failure MUST NOT affect other taxonomies; use `Promise.allSettled`
- `grep -r "game-engine" apps/registry-viewer/` MUST return 0
- Chip rows MUST wrap; no horizontal scroll
- Slugs are permanent once in R2 — do not rename any slug from the locked enums

## Required `// why:` Comments
- `applyQuery` single-cardType enforcement: `// why: cross-taxonomy pattern filter has undefined semantics`
- Chip wrap CSS rule: `// why: avoids hidden patterns on smaller screens`

## Files to Produce
- `data/metadata/hero-patterns.json` — **new** — 10 pattern definitions
- `data/metadata/hero-pattern-assignments.json` — **new** — ≥ 302 hero mappings
- `data/metadata/villain-patterns.json` — **new** — 8 pattern definitions
- `data/metadata/villain-pattern-assignments.json` — **new** — ≥ 120 villain group mappings
- `data/metadata/henchman-patterns.json` — **new** — 6 pattern definitions
- `data/metadata/henchman-pattern-assignments.json` — **new** — 46 henchman group mappings
- `data/metadata/mastermind-patterns.json` — **new** — 8 pattern definitions
- `data/metadata/mastermind-pattern-assignments.json` — **new** — ≥ 101 mastermind mappings
- `packages/registry/src/schema.ts` — **modified** — 4 slug enums + 4 assignment schemas + type exports
- `apps/registry-viewer/src/lib/cardPatternsClient.ts` — **new** — 8-fetch singleton
- `apps/registry-viewer/src/components/PatternFilter.vue` — **new** — generic chip ribbon
- `apps/registry-viewer/src/components/CardDetail.vue` — **modified** — pattern badge
- `apps/registry-viewer/src/components/CardGrid.vue` — **modified** — pattern tile badge
- `apps/registry-viewer/src/registry/shared.ts` — **modified** — flattenSet + applyQuery
- `apps/registry-viewer/src/App.vue` — **modified** — fetch + wire

## After Completing
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm -r build` exits 0
- [ ] `grep -r "game-engine" apps/registry-viewer/` returns 0
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date + commit SHA
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` status updated to Done

## Common Failure Smells
- `mechanicalPattern` populated on scheme cards → `flattenSet` routing leaked into scheme branch; check explicit `cardType` key
- Pattern filter active with two card types still filtering → single-cardType guard missing in `applyQuery`, not just in UI
- Hero slug accepted by villain assignments parse → using `z.string()` instead of per-taxonomy `z.enum`
- One taxonomy failure silently breaks another → `allSettled` branches not per-taxonomy isolated
